import { apiFetch } from './api';

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

/** A described person, as the backend's report tool sends it (snake_case). */
export interface CapturedSubject {
  age_range?: string;
  sex?: string;
  height?: string;
  build?: string;
  hair?: string;
  clothing_top?: string;
  clothing_bottom?: string;
  footwear?: string;
  distinguishing_features?: string;
  behavior?: string;
  direction_of_travel?: string;
}

export interface CapturedVehicle {
  make?: string;
  model?: string;
  color?: string;
  body_type?: string;
  plate?: string;
  plate_state?: string;
  direction_of_travel?: string;
  notes?: string;
}

/** The structured report the interviewer files via its backend tool. */
export interface CapturedReport {
  category: string;
  description: string;
  priority?: number;
  title?: string;
  happening_now?: boolean;
  at_reporter_location?: boolean;
  location_hint?: string;
  occurred_at_hint?: string;
  weapons_seen?: boolean;
  injuries?: boolean;
  subjects?: CapturedSubject[];
  vehicles?: CapturedVehicle[];
  contact_ok?: boolean;
}

export interface LiveCallbacks {
  onStatus?: (status: LiveStatus) => void;
  /** One finished utterance from the officer, stitched from GPT-Live's word pieces. */
  onUserTranscript?: (text: string) => void;
  /** The assistant's current line as it is spoken; `done` once the line is complete. */
  onAssistantTranscript?: (text: string, done: boolean) => void;
  /** The backend filed the report — the structured fields for the draft. */
  onReport?: (report: CapturedReport) => void;
  onSpeakingChange?: (assistantSpeaking: boolean) => void;
  /** ~20×/s: caller mic level and interviewer voice level, 0…1 (for the visualizer). */
  onLevels?: (user: number, assistant: number) => void;
  onError?: (message: string) => void;
}

/** Server-written lines sent over the data channel so the assistant speaks first. */
interface OpeningScript {
  /** `session.instructions.append` right after `session.started`: speak first, then listen. */
  instructions: string;
  /** `session.commentary.append` once those instructions are acknowledged: begin now. */
  commentary: string;
}

interface LiveSessionResponse {
  sdp: string;
  sessionId: string | null;
  opening: OpeningScript | null;
  persona?: 'business' | 'officer';
  tool?: string;
}

interface ToolCallItem {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

interface LiveEvent {
  type?: string;
  event_id?: string;
  client_event_id?: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  reason?: string;
  error?: { code?: string; message?: string; type?: string; param?: string };
  event?: { type?: string; item?: ToolCallItem };
  delegation?: { id?: string; target?: string };
}

type Speaker = 'user' | 'assistant';

interface TranscriptRow {
  text: string;
  endMs: number;
}

/** Give up if `session.started` hasn't arrived this long after the answer was applied. */
const START_TIMEOUT_MS = 15000;
/** How long `stop()` waits for `session.closed` (the final usage) before tearing down. */
const CLOSE_WAIT_MS = 1500;
/** ICE gathering cap — a VPN or a strict NAT can keep gathering for a long time. */
const ICE_GATHER_MS = 1500;
/** Fragments from the same speaker further apart than this on the timeline are two utterances. */
const TURN_GAP_MS = 2500;
/** With no new fragment for this long, the utterance is handed to the UI as finished. */
const ROW_IDLE_MS = 3000;
/** Remote-track RMS above which the assistant is audibly speaking (silence and comfort noise sit far below). */
const METER_THRESHOLD = 0.01;
/** Level-meter hangover: pauses between words shorter than this are not silence. */
const METER_HANGOVER_MS = 350;
const TICK_MS = 50;
const DEFAULT_REPORT_TOOL = 'file_incident_report';
/** Hard stop so a forgotten call doesn't run up minutes. */
const MAX_CALL_MS = 10 * 60_000;

/**
 * Fragments are word pieces that carry their own spacing ("Filed", " as",
 * " Suspicious", " Activ", "ity"), so they concatenate verbatim; only the piece
 * that opens a row drops its leading space.
 */
function joinFragment(text: string, delta: string): string {
  return text ? text + delta : delta.replace(/^\s+/, '');
}

function waitForIceGathering(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      window.clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = window.setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/**
 * One WebRTC call to GPT-Live.
 *
 * GPT-Live is full duplex: it listens while it speaks and decides for itself
 * when to talk, so there is no turn detection to drive, no response lifecycle
 * to follow and no mic gate — the mic stays open for the whole call and the
 * officer interrupts by talking (a loudspeaker's echo is left to the browser's
 * echo canceller and the model). What the class owns:
 *
 * - the **connection**: mic → offer → our `/api/live-session` → SDP answer →
 *   `session.started` on the data channel, then the scripted opening so the
 *   assistant speaks first;
 * - the **transcript**: GPT-Live streams timed word pieces per speaker with no
 *   turn boundaries, so they are stitched into utterances by timeline gap;
 * - the **report tool**: the Responses backend calls `file_incident_report`;
 *   the browser answers it over the data channel and fills the draft;
 * - a **speaking** readout — a level meter on the remote track — and a graceful
 *   close that waits for the session's final usage.
 */
export class LiveSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private meter: { analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null;
  private micMeter: { analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null;
  private assistantLevel = 0;
  private userLevel = 0;
  private toolName = DEFAULT_REPORT_TOOL;
  private maxTimer: number | null = null;
  private muted = false;
  private startTimer: number | null = null;
  private tickTimer: number | null = null;
  private opening: OpeningScript | null = null;
  private openingEventId: string | null = null;
  /** The caller has started talking — don't greet or nudge over them. */
  private callerSpoke = false;
  private eventSeq = 0;
  private started = false;
  private stopped = false;
  private closeSent = false;
  private closeWaiter: (() => void) | null = null;
  /** call_ids already answered — every call gets exactly one result. */
  private readonly handledCalls = new Set<string>();
  private readonly rows: Record<Speaker, TranscriptRow | null> = { user: null, assistant: null };
  private readonly rowTimers: Record<Speaker, number | null> = { user: null, assistant: null };
  private heardVoiceAt = Number.NEGATIVE_INFINITY;
  private transcriptSpeakUntil = 0;
  private speaking = false;
  private cb: LiveCallbacks;

  constructor(cb: LiveCallbacks) {
    this.cb = cb;
  }

  async start(): Promise<void> {
    if (this.pc || this.stopped) return;
    this.cb.onStatus?.('connecting');
    // Inside the tap, before any await: the meter's AudioContext needs the user gesture.
    this.createAudioContext();
    try {
      if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support voice calls');
      }
      // Echo cancellation, noise suppression and gain control stay on — on a
      // loudspeaker the echo canceller is what keeps the assistant's own voice
      // out of the mic.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      this.micMeter = this.createMeter(stream);

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Remote (assistant) audio playback. The element stays attached for the
      // whole call — without it Chrome feeds Web Audio (the meter) nothing.
      const audioEl = new Audio();
      audioEl.autoplay = true;
      this.audioEl = audioEl;
      pc.ontrack = (e) => {
        const remote = e.streams[0];
        if (!remote) return;
        audioEl.srcObject = remote;
        this.attachMeter(remote);
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' && !this.stopped) {
          this.cb.onError?.('The voice connection dropped');
          this.cb.onStatus?.('error');
          void this.stop();
        }
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Events channel: `session.started`, transcripts, the report tool, close.
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (e) => this.handleMessage(String(e.data));

      // The offer goes to OUR server, which creates the GPT-Live session with
      // the project key and returns the answer (plus the opening script).
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc, ICE_GATHER_MS);
      const sdp = pc.localDescription?.sdp ?? offer.sdp ?? '';
      const created = await apiFetch<LiveSessionResponse>('/api/live-session', {
        method: 'POST',
        json: { sdp },
      });
      if (!created?.sdp) throw new Error('No session answer returned');
      if (this.stopped) return;
      this.opening = created.opening ?? null;
      if (created.tool) this.toolName = created.tool;
      await pc.setRemoteDescription({ type: 'answer', sdp: created.sdp });

      // The session is live once `session.started` arrives on the data channel.
      this.startTimer = window.setTimeout(() => {
        this.startTimer = null;
        if (!this.started && !this.stopped) {
          this.cb.onError?.('The voice session did not start');
          this.cb.onStatus?.('error');
          void this.stop();
        }
      }, START_TIMEOUT_MS);
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
      this.maxTimer = window.setTimeout(() => {
        this.maxTimer = null;
        if (!this.stopped) {
          this.cb.onError?.('The call reached its 10-minute limit — your draft is saved below.');
          void this.stop();
        }
      }, MAX_CALL_MS);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      const message =
        name === 'NotAllowedError'
          ? 'Microphone access was blocked'
          : err instanceof Error
            ? err.message
            : 'Could not start voice session';
      this.cb.onStatus?.('error');
      this.cb.onError?.(message);
      void this.stop();
    }
  }

  /**
   * End the call: hand the last utterances to the UI, send `session.close`,
   * wait (briefly) for `session.closed` so the final usage is written, then
   * tear everything down. Safe to call more than once.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    // Nothing more goes out while the session finalizes.
    if (this.micTrack) this.micTrack.enabled = false;
    this.flushRow('user');
    this.flushRow('assistant');
    await this.requestClose();
    this.teardown();
  }

  /** Mute / unmute the caller's microphone (the interviewer is told too). */
  setMuted(muted: boolean): void {
    if (this.muted === muted || this.stopped) return;
    this.muted = muted;
    if (this.micTrack) this.micTrack.enabled = !muted;
    this.send({ type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute', event_id: this.nextEventId('mute') });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private nextEventId(prefix: string): string {
    this.eventSeq += 1;
    return `${prefix}-${this.eventSeq}`;
  }

  private send(payload: Record<string, unknown>): boolean {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /* ── The level meter on the assistant's voice ────────────────────────────
     GPT-Live sends no "speaking started / stopped" events over WebRTC — audio
     simply arrives on the media track — so the readout listens to the track
     itself. Without Web Audio, the transcript fragments' durations stand in. */
  private createAudioContext(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ctx.resume().catch(() => {});
      this.audioCtx = ctx;
    } catch {
      this.audioCtx = null;
    }
  }

  private attachMeter(stream: MediaStream): void {
    this.meter = this.createMeter(stream);
  }

  /** An analyser on a stream (never connected to the speakers). */
  private createMeter(stream: MediaStream): { analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null {
    const ctx = this.audioCtx;
    if (!ctx) return null;
    try {
      const analyser = ctx.createAnalyser();
      if (typeof analyser.getFloatTimeDomainData !== 'function') return null;
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0;
      ctx.createMediaStreamSource(stream).connect(analyser);
      return { analyser, buf: new Float32Array(analyser.fftSize) };
    } catch {
      return null;
    }
  }

  private static rms(meter: { analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> }): number {
    meter.analyser.getFloatTimeDomainData(meter.buf);
    let sum = 0;
    for (let i = 0; i < meter.buf.length; i++) sum += meter.buf[i] * meter.buf[i];
    return Math.sqrt(sum / meter.buf.length);
  }

  /** 20× a second: sample the meter and settle the speaking readout. */
  private tick = (): void => {
    const now = performance.now();
    const meter = this.meter;
    let assistantRms = 0;
    if (meter) {
      assistantRms = LiveSession.rms(meter);
      if (assistantRms > METER_THRESHOLD) this.heardVoiceAt = now;
    }
    const speaking = meter
      ? now - this.heardVoiceAt < METER_HANGOVER_MS
      : now < this.transcriptSpeakUntil;
    if (speaking !== this.speaking) {
      this.speaking = speaking;
      this.cb.onSpeakingChange?.(speaking);
    }
    if (this.cb.onLevels) {
      const userRms = this.micMeter && !this.muted ? LiveSession.rms(this.micMeter) : 0;
      // Map RMS (speech ≈ 0.02–0.2) onto 0…1 and smooth it for the visualizer.
      const norm = (v: number) => Math.min(1, Math.sqrt(v / 0.18));
      this.userLevel = this.userLevel * 0.6 + norm(userRms) * 0.4;
      this.assistantLevel = meter
        ? this.assistantLevel * 0.6 + norm(assistantRms) * 0.4
        : this.assistantLevel * 0.6 + (speaking ? 0.5 : 0) * 0.4;
      this.cb.onLevels(this.userLevel, this.assistantLevel);
    }
  };

  /* ── Transcript, by speaker and timeline ────────────────────────────────
     GPT-Live streams `session.input_transcript.delta` (the officer) and
     `session.output_transcript.delta` (the assistant) as timed word pieces
     with no turn boundaries. A piece joins the speaker's open utterance when
     it follows within TURN_GAP_MS on the session timeline; otherwise the open
     utterance is finished and a new one starts. An utterance is also finished
     once no piece has arrived for ROW_IDLE_MS (the officer's transcript can
     lag the audio by seconds) and when the call ends. */
  private addFragment(role: Speaker, delta: string, startMs: number, endMs: number): void {
    if (!delta) return;
    const open = this.rows[role];
    if (open && startMs - open.endMs >= TURN_GAP_MS) this.flushRow(role);
    const row = this.rows[role];
    if (row) {
      row.text = joinFragment(row.text, delta);
      row.endMs = Math.max(row.endMs, endMs);
    } else {
      this.rows[role] = { text: joinFragment('', delta), endMs };
    }
    if (role === 'assistant') this.cb.onAssistantTranscript?.(this.rows.assistant?.text ?? '', false);
    const pending = this.rowTimers[role];
    if (pending !== null) window.clearTimeout(pending);
    this.rowTimers[role] = window.setTimeout(() => {
      this.rowTimers[role] = null;
      this.flushRow(role);
    }, ROW_IDLE_MS);
  }

  private flushRow(role: Speaker): void {
    const pending = this.rowTimers[role];
    if (pending !== null) {
      window.clearTimeout(pending);
      this.rowTimers[role] = null;
    }
    const row = this.rows[role];
    this.rows[role] = null;
    const text = row?.text.trim() ?? '';
    if (!text) return;
    if (role === 'user') this.cb.onUserTranscript?.(text);
    else this.cb.onAssistantTranscript?.(text, true);
  }

  /* ── The opening: the assistant speaks first ────────────────────────────
     GPT-Live waits for the caller by default. OpenAI's greeting recipe:
     append instructions to greet now, wait for the ack, then a commentary
     nudge to begin. Both lines are written by our server. */
  private sendOpening(): void {
    const op = this.opening;
    if (!op?.instructions || this.callerSpoke) return;
    const id = this.nextEventId('opening');
    this.openingEventId = id;
    this.send({ type: 'session.instructions.append', delegation_id: null, event_id: id, content: op.instructions });
  }

  /* ── The report tool ────────────────────────────────────────────────────
     The Responses backend holds `file_incident_report`. Its completed call
     arrives wrapped in `response.event` as `response.output_item.done`; the
     browser fills the draft and returns the result. Every call must get
     exactly one `response.item.create` (function_call_output) FOLLOWED BY
     `response.create` — the result alone does not resume the backend, and a
     call left unanswered blocks every later delegation. */
  private handleToolCall(item: ToolCallItem): void {
    const callId = typeof item.call_id === 'string' ? item.call_id : '';
    if (!callId || this.handledCalls.has(callId)) return;
    this.handledCalls.add(callId);
    const result = this.runTool(item.name ?? '', item.arguments ?? '');
    this.send({
      type: 'response.item.create',
      event_id: `tool-${callId}`,
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) },
    });
    this.send({ type: 'response.create', event_id: `continue-${callId}` });
  }

  private runTool(name: string, rawArgs: string): Record<string, unknown> {
    if (name !== this.toolName) return { filed: false, error: `Unknown tool: ${name || '(unnamed)'}` };
    let args: Partial<CapturedReport> | null;
    try {
      args = JSON.parse(rawArgs || '{}') as Partial<CapturedReport> | null;
    } catch {
      return { filed: false, error: 'The arguments were not valid JSON; nothing was filed.' };
    }
    if (!args || typeof args.category !== 'string' || typeof args.description !== 'string' || !args.description.trim()) {
      return { filed: false, error: 'category and description are required; nothing was filed.' };
    }
    const report: CapturedReport = {
      ...args,
      category: args.category,
      description: args.description.trim(),
      location_hint: typeof args.location_hint === 'string' ? args.location_hint.trim() : undefined,
      subjects: Array.isArray(args.subjects) ? args.subjects.slice(0, 6) : [],
      vehicles: Array.isArray(args.vehicles) ? args.vehicles.slice(0, 6) : [],
    };
    this.cb.onReport?.(report);
    return {
      filed: true,
      category: report.category,
      priority: report.priority ?? null,
      location_hint: report.location_hint || (report.at_reporter_location ? "the caller's business" : null),
      note: "The draft report is on the caller's screen; they will review it, add photos and press submit to send it to the officers.",
    };
  }

  private handleMessage(raw: string): void {
    let ev: LiveEvent;
    try {
      ev = JSON.parse(raw) as LiveEvent;
    } catch {
      return;
    }
    const now = performance.now();

    switch (ev.type) {
      case 'session.started':
        if (this.startTimer !== null) {
          window.clearTimeout(this.startTimer);
          this.startTimer = null;
        }
        this.started = true;
        this.cb.onStatus?.('connected');
        this.sendOpening();
        break;

      case 'session.instructions.appended':
        if (ev.client_event_id && ev.client_event_id === this.openingEventId && this.opening?.commentary) {
          this.openingEventId = null;
          // The caller spoke first: answer them instead of reciting the greeting.
          if (this.callerSpoke) break;
          this.send({
            type: 'session.commentary.append',
            delegation_id: null,
            event_id: this.nextEventId('begin'),
            content: this.opening.commentary,
          });
        }
        break;

      /* the officer */
      case 'session.input_transcript.delta':
        if (String(ev.delta ?? '').trim()) this.callerSpoke = true;
        this.addFragment('user', String(ev.delta ?? ''), Number(ev.start_ms ?? 0), Number(ev.end_ms ?? ev.start_ms ?? 0));
        break;

      /* the assistant */
      case 'session.output_transcript.delta': {
        const start = Number(ev.start_ms ?? 0);
        const end = Number(ev.end_ms ?? start);
        if (!this.meter) {
          this.transcriptSpeakUntil = Math.max(this.transcriptSpeakUntil, now + Math.max(0, end - start) + 500);
        }
        this.addFragment('assistant', String(ev.delta ?? ''), start, end);
        break;
      }

      case 'session.delegation.created': {
        // Responses-target delegations run server-side and their tool calls
        // arrive in `response.event`. A client-target delegation should never
        // happen with this configuration; if one does, the model is waiting on
        // us — release it rather than let the call freeze.
        const d = ev.delegation;
        if (d?.target === 'client' && typeof d.id === 'string') {
          this.send({
            type: 'session.commentary.append',
            delegation_id: d.id,
            event_id: this.nextEventId('release'),
            content: '(No additional information available; answer directly and briefly.)',
          });
        }
        break;
      }

      case 'response.event': {
        const inner = ev.event;
        if (inner?.type === 'response.output_item.done' && inner.item?.type === 'function_call') {
          this.handleToolCall(inner.item);
        } else if (inner?.type === 'response.incomplete' || inner?.type === 'response.failed') {
          // e.g. the output cap cut the report call off — say so in the console.
          console.warn('[live] report backend', inner.type, inner);
        }
        break;
      }

      case 'session.closed': {
        const waiter = this.closeWaiter;
        this.closeWaiter = null;
        this.closeSent = true;
        if (waiter) {
          waiter();
          break;
        }
        // The server ended it: the duration limit, a safety stop, or a lost link.
        if (!this.stopped) {
          if (ev.reason === 'connection_lost') {
            this.cb.onError?.('The voice connection dropped');
            this.cb.onStatus?.('error');
          }
          void this.stop();
        }
        break;
      }

      case 'error': {
        const e = ev.error;
        // A rejected client command is our bug, not theirs — it never stops the conversation.
        if (e?.type === 'invalid_request_error') {
          console.warn('[live] command rejected:', e);
          break;
        }
        console.error('[live] event error:', ev);
        this.cb.onError?.(e?.message || 'Voice session error');
        break;
      }
    }
  }

  /** `session.close`, then wait (briefly) for `session.closed` so the final usage is written. */
  private requestClose(): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open' || this.closeSent) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.closeWaiter = null;
        resolve();
      }, CLOSE_WAIT_MS);
      this.closeWaiter = () => {
        window.clearTimeout(timer);
        resolve();
      };
      if (this.send({ type: 'session.close', event_id: this.nextEventId('close') })) {
        this.closeSent = true;
      } else {
        window.clearTimeout(timer);
        this.closeWaiter = null;
        resolve();
      }
    });
  }

  private clearTimers(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.maxTimer !== null) {
      window.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
  }

  private teardown(): void {
    this.clearTimers();
    this.closeWaiter = null;
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) this.audioEl.srcObject = null;
    this.audioCtx?.close().catch(() => {});
    this.pc = null;
    this.dc = null;
    this.stream = null;
    this.micTrack = null;
    this.audioEl = null;
    this.audioCtx = null;
    this.meter = null;
    this.micMeter = null;
    this.cb.onLevels?.(0, 0);
    if (this.speaking) {
      this.speaking = false;
      this.cb.onSpeakingChange?.(false);
    }
    this.cb.onStatus?.('closed');
  }
}
