import type { VoiceConversation } from '@elevenlabs/client';
import { apiFetch } from './api';
import type { LiveCallbacks } from './live';
import { captureReport } from './reportTool';

interface VoiceSessionResponse {
  provider: 'elevenlabs';
  token: string;
  dynamicVariables: Record<string, string>;
  tool: string;
}

const TICK_MS = 50;
/** Audio arrives in chunks: brief gaps between them aren't the interviewer going quiet. */
const SPEAKING_HANGOVER_MS = 400;

function debugOn(): boolean {
  try {
    return localStorage.getItem('dt-voice-debug') === '1';
  } catch {
    return false;
  }
}

/**
 * The ElevenLabs voice line. The browser joins the interviewer agent over
 * WebRTC with a one-time token from `/api/voice-session`; ElevenLabs runs the
 * call — speech recognition, turn-taking, interruptions and the Eleven v4
 * voice — and the agent fills the draft through `file_incident_report`, which
 * runs here. Same callbacks as the GPT-Live line, so the interview screen
 * doesn't care which one it has.
 *
 * Set localStorage `dt-voice-debug` to "1" to log the call's events.
 */
export class ElevenSession {
  private conv: VoiceConversation | null = null;
  private stopped = false;
  private muted = false;
  private tickTimer: number | null = null;
  private quietTimer: number | null = null;
  private speaking = false;
  private userLevel = 0;
  private assistantLevel = 0;
  private readonly cb: LiveCallbacks;
  private readonly voiceId?: string;
  private readonly debug = debugOn();
  private readonly t0 = performance.now();

  constructor(cb: LiveCallbacks, opts: { voiceId?: string } = {}) {
    this.cb = cb;
    this.voiceId = opts.voiceId;
  }

  private log(event: string, detail?: unknown): void {
    if (this.debug) console.info(`[voice +${Math.round(performance.now() - this.t0)}ms] ${event}`, detail ?? '');
  }

  async start(): Promise<void> {
    if (this.conv || this.stopped) return;
    this.cb.onStatus?.('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support voice calls');
      // Ask for the microphone first, inside the tap — Safari wants the gesture.
      // The agent opens its own (echo-cancelled) stream once connected.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      this.log('microphone allowed');
      if (this.stopped) return;

      const [{ Conversation }, session] = await Promise.all([
        import('@elevenlabs/client'),
        apiFetch<VoiceSessionResponse>('/api/voice-session', { method: 'POST' }),
      ]);
      if (this.stopped) return;
      if (!session?.token) throw new Error('No voice session returned');
      this.log('token');

      const conv = await Conversation.startSession({
        conversationToken: session.token,
        connectionType: 'webrtc',
        textOnly: false,
        dynamicVariables: session.dynamicVariables,
        overrides: this.voiceId ? { tts: { voiceId: this.voiceId } } : undefined,
        clientTools: { [session.tool]: (params: unknown) => this.fileReport(params) },
        onConnect: ({ conversationId }) => {
          this.log('connected', conversationId);
          this.cb.onStatus?.('connected');
        },
        onDisconnect: (details) => {
          this.log('disconnected', details);
          this.stopTicker();
          if (details.reason === 'error') {
            this.cb.onError?.(details.message || 'The voice connection dropped');
            this.cb.onStatus?.('error');
          } else {
            this.cb.onStatus?.('closed');
          }
          this.setSpeaking(false, true);
          this.conv = null;
        },
        onError: (message) => {
          this.log('error', message);
          this.cb.onError?.(message || 'The voice line had a problem');
        },
        onMessage: ({ message, role }) => {
          // Eleven v4 delivery cues ("[urgent]", "[calm]") shape the voice; they aren't words to show.
          const text = typeof message === 'string' ? message.replace(/\[[a-z][a-z ,'-]{0,30}\]\s*/gi, '').trim() : '';
          this.log(role, text);
          if (!text) return;
          if (role === 'user') this.cb.onUserTranscript?.(text);
          else this.cb.onAssistantTranscript?.(text, true);
        },
        onModeChange: ({ mode }) => {
          this.log('mode', mode);
          this.setSpeaking(mode === 'speaking');
        },
      });
      if (this.stopped) {
        await conv.endSession();
        return;
      }
      this.conv = conv;
      if (this.muted) conv.setMicMuted(true);
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      const message =
        name === 'NotAllowedError'
          ? 'Microphone access was blocked'
          : err instanceof Error && err.message
            ? err.message
            : 'Could not start the voice call';
      this.log('start failed', message);
      this.cb.onStatus?.('error');
      this.cb.onError?.(message);
      void this.stop();
    }
  }

  /** Hang up. Safe to call more than once. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.log('stop');
    this.stopTicker();
    const conv = this.conv;
    this.conv = null;
    if (conv) {
      try {
        await conv.endSession();
      } catch {
        /* already gone */
      }
    }
    this.setSpeaking(false, true);
    this.cb.onLevels?.(0, 0);
  }

  private setSpeaking(speaking: boolean, now = false): void {
    if (this.quietTimer !== null) {
      window.clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    if (speaking || now) {
      if (this.speaking !== speaking) this.cb.onSpeakingChange?.(speaking);
      this.speaking = speaking;
      return;
    }
    this.quietTimer = window.setTimeout(() => {
      this.quietTimer = null;
      if (this.speaking) this.cb.onSpeakingChange?.(false);
      this.speaking = false;
    }, SPEAKING_HANGOVER_MS);
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted || this.stopped) return;
    this.muted = muted;
    this.conv?.setMicMuted(muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** The agent's report tool: fill the draft, answer with what to read back. */
  private fileReport(params: unknown): string {
    const { report, result } = captureReport(params);
    this.log('report', result);
    if (report) this.cb.onReport?.(report);
    return JSON.stringify(result);
  }

  private tick = (): void => {
    const conv = this.conv;
    if (!conv || !this.cb.onLevels) return;
    // The SDK's levels average the frequency bins (speech ≈ 0.05–0.4): lift and smooth them.
    const lift = (v: number) => Math.min(1, Math.sqrt(Math.max(0, v) * 2.5));
    this.userLevel = this.userLevel * 0.6 + (this.muted ? 0 : lift(conv.getInputVolume())) * 0.4;
    this.assistantLevel = this.assistantLevel * 0.6 + lift(conv.getOutputVolume()) * 0.4;
    this.cb.onLevels(this.userLevel, this.assistantLevel);
  };

  private stopTicker(): void {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
