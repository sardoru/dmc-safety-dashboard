import { apiFetch } from './api';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export interface CapturedReport {
  incident_type: string;
  description: string;
  location_hint?: string;
}

export interface RealtimeCallbacks {
  onStatus?: (status: RealtimeStatus) => void;
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string, done: boolean) => void;
  onReport?: (report: CapturedReport) => void;
  onSpeakingChange?: (assistantSpeaking: boolean) => void;
  onError?: (message: string) => void;
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
}

/**
 * Manages a GPT Realtime voice-to-voice session over WebRTC.
 *
 * Mobile speakers leak the assistant's voice back into the mic, which the
 * server VAD hears as the user interrupting. On mobile we run half-duplex:
 * the mic is muted whenever the assistant is speaking. (The server VAD
 * threshold is also raised in the session config.)
 */
export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private assistantBuffer = '';
  private readonly mobile = isMobileDevice();
  private cb: RealtimeCallbacks;

  constructor(cb: RealtimeCallbacks) {
    this.cb = cb;
  }

  get isMobile(): boolean {
    return this.mobile;
  }

  async start(): Promise<void> {
    this.cb.onStatus?.('connecting');
    try {
      const { value: ephemeralKey, model } = await apiFetch<{ value: string; model: string }>(
        '/api/realtime/session',
        { method: 'POST', json: {} },
      );
      if (!ephemeralKey) throw new Error('No realtime token returned');

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Remote (assistant) audio playback.
      const audioEl = new Audio();
      audioEl.autoplay = true;
      this.audioEl = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // Microphone.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micTrack = this.stream.getAudioTracks()[0];
      pc.addTrack(this.micTrack, this.stream);

      // Events channel.
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (e) => this.handleEvent(e.data);
      dc.onopen = () => {
        this.cb.onStatus?.('connected');
        this.send({
          type: 'response.create',
          response: { instructions: 'Briefly greet the officer and ask what they witnessed.' },
        });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        },
      );
      if (!sdpResp.ok) throw new Error(`Realtime connect failed (${sdpResp.status})`);
      const answer = { type: 'answer' as const, sdp: await sdpResp.text() };
      await pc.setRemoteDescription(answer);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          this.cb.onStatus?.('error');
        }
      };
    } catch (err) {
      this.cb.onStatus?.('error');
      this.cb.onError?.(err instanceof Error ? err.message : 'Could not start voice session');
      this.stop();
    }
  }

  stop(): void {
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) this.audioEl.srcObject = null;
    this.pc = null;
    this.dc = null;
    this.stream = null;
    this.micTrack = null;
    this.audioEl = null;
    this.cb.onStatus?.('closed');
  }

  private send(payload: unknown): void {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(payload));
  }

  private setAssistantSpeaking(speaking: boolean): void {
    this.cb.onSpeakingChange?.(speaking);
    // Half-duplex gate on mobile to prevent echo self-interruption.
    if (this.mobile && this.micTrack) this.micTrack.enabled = !speaking;
  }

  private handleEvent(raw: string): void {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    const type = String(evt.type || '');

    switch (type) {
      case 'output_audio_buffer.started':
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.setAssistantSpeaking(true);
        break;

      case 'output_audio_buffer.stopped':
      case 'response.done':
        this.setAssistantSpeaking(false);
        break;

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        this.assistantBuffer += String(evt.delta ?? '');
        this.cb.onAssistantTranscript?.(this.assistantBuffer, false);
        break;
      }
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const finalText = String(evt.transcript ?? this.assistantBuffer);
        this.cb.onAssistantTranscript?.(finalText, true);
        this.assistantBuffer = '';
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(evt.transcript ?? '').trim();
        if (text) this.cb.onUserTranscript?.(text);
        break;
      }

      case 'response.function_call_arguments.done': {
        try {
          const args = JSON.parse(String(evt.arguments ?? '{}')) as CapturedReport;
          if (args && args.incident_type) this.cb.onReport?.(args);
        } catch {
          /* ignore malformed tool args */
        }
        break;
      }

      case 'error': {
        const message =
          (evt.error as { message?: string } | undefined)?.message || 'Realtime error';
        this.cb.onError?.(message);
        break;
      }
    }
  }
}
