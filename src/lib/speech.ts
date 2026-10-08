import { supabase } from './supabase';

/**
 * One app-wide speech channel.
 *
 * Text is voiced by ElevenLabs Eleven v4 through our `/api/tts` function
 * (the API key stays on the server). When that isn't available — demo mode,
 * signed out, key not configured, offline — it falls back to the browser's
 * built-in speech synthesis so alerts and read-backs still work.
 *
 * Utterances queue; `interrupt` clears the queue first. Browsers only allow
 * audio after a user gesture, so call `unlock()` from a click handler once.
 */
export type SpeechEngineKind = 'elevenlabs' | 'browser';

export interface SpeakOptions {
  voiceId?: string;
  /** Identifies the utterance in UI state (e.g. an incident id). */
  key?: string;
  /** Stop whatever is playing and clear the queue first. */
  interrupt?: boolean;
  /** Keep the audio for re-use (fixed prompts). */
  cache?: boolean;
}

export interface SpeechState {
  speaking: boolean;
  loading: boolean;
  key: string | null;
  engine: SpeechEngineKind | null;
  /** null = not probed yet. */
  elevenAvailable: boolean | null;
  lastError: string | null;
}

interface Job {
  text: string;
  opts: SpeakOptions;
  resolve: (engine: SpeechEngineKind | null) => void;
  cancelled: boolean;
}

const CACHE_LIMIT = 40;

function sentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > 220 && buf) {
      out.push(buf.trim());
      buf = '';
    }
    buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

class SpeechChannel {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private queue: Job[] = [];
  private current: Job | null = null;
  private abort: AbortController | null = null;
  private cache = new Map<string, string>();
  private listeners = new Set<(s: SpeechState) => void>();
  private stopPlayback: (() => void) | null = null;
  private state: SpeechState = {
    speaking: false,
    loading: false,
    key: null,
    engine: null,
    elevenAvailable: null,
    lastError: null,
  };

  subscribe(fn: (s: SpeechState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): SpeechState {
    return this.state;
  }

  private set(patch: Partial<SpeechState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  setElevenAvailable(value: boolean | null) {
    this.set({ elevenAvailable: value });
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  /** Call from a user gesture: lets later alerts play without one. */
  unlock(): void {
    const audio = this.ensureAudio();
    try {
      // A tiny silent WAV primes the element on iOS / Safari.
      audio.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      void audio.play().catch(() => {});
    } catch {
      /* ignore */
    }
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) this.ctx = new Ctx();
      }
      void this.ctx?.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
    if ('speechSynthesis' in window) {
      // Warm up the voice list (Chrome loads it lazily).
      window.speechSynthesis.getVoices();
    }
  }

  /** Short alert tone; louder/two-tone for urgent incidents. */
  chime(level: 'critical' | 'high' | 'normal' = 'normal'): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
      }
      const ctx = this.ctx;
      const tones = level === 'critical' ? [988, 740, 988] : level === 'high' ? [880, 660] : [784];
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level === 'normal' ? 0.18 : 0.28, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } catch {
      /* audio unavailable */
    }
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<SpeechEngineKind | null> {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return Promise.resolve(null);
    if (opts.interrupt) this.stop();
    return new Promise((resolve) => {
      this.queue.push({ text: clean, opts, resolve, cancelled: false });
      void this.pump();
    });
  }

  /** Stop the current utterance and drop the queue. */
  stop(): void {
    for (const job of this.queue) {
      job.cancelled = true;
      job.resolve(null);
    }
    this.queue = [];
    if (this.current) this.current.cancelled = true;
    this.abort?.abort();
    this.abort = null;
    this.stopPlayback?.();
    this.stopPlayback = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.set({ speaking: false, loading: false, key: null });
  }

  isSpeaking(key?: string): boolean {
    return this.state.speaking && (key === undefined || this.state.key === key);
  }

  private async pump(): Promise<void> {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    let engine: SpeechEngineKind | null = null;
    try {
      engine = await this.play(job);
    } catch (err) {
      this.set({ lastError: err instanceof Error ? err.message : 'Speech failed' });
    } finally {
      job.resolve(job.cancelled ? null : engine);
      this.current = null;
      if (!this.queue.length) this.set({ speaking: false, loading: false, key: null });
      void this.pump();
    }
  }

  private async play(job: Job): Promise<SpeechEngineKind | null> {
    this.set({ loading: true, speaking: false, key: job.opts.key ?? null, lastError: null });
    if (this.state.elevenAvailable !== false) {
      try {
        const url = await this.fetchEleven(job);
        if (job.cancelled) return null;
        if (url) {
          this.set({ loading: false, speaking: true, engine: 'elevenlabs' });
          await this.playUrl(url, job);
          if (!job.opts.cache) URL.revokeObjectURL(url);
          return 'elevenlabs';
        }
      } catch (err) {
        if (job.cancelled) return null;
        this.set({ lastError: err instanceof Error ? err.message : 'ElevenLabs speech failed' });
      }
    }
    if (job.cancelled) return null;
    this.set({ loading: false, speaking: true, engine: 'browser' });
    await this.speakBrowser(job);
    return 'browser';
  }

  /** Returns an object URL with the audio, or null when ElevenLabs can't be used. */
  private async fetchEleven(job: Job): Promise<string | null> {
    const cacheKey = `${job.opts.voiceId ?? ''}::${job.text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    this.abort = new AbortController();
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: job.text, voiceId: job.opts.voiceId }),
      signal: this.abort.signal,
    });
    if (resp.status === 503 || resp.status === 404) {
      // Not configured on this deployment — stop trying until a refresh.
      this.set({ elevenAvailable: false });
      return null;
    }
    if (!resp.ok) {
      const msg = await resp.json().catch(() => ({}) as { error?: string });
      throw new Error((msg as { error?: string }).error || `Speech failed (${resp.status})`);
    }
    const blob = await resp.blob();
    if (!blob.size) throw new Error('Empty audio');
    this.set({ elevenAvailable: true });
    const url = URL.createObjectURL(blob);
    if (job.opts.cache) {
      this.cache.set(cacheKey, url);
      if (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value as string;
        URL.revokeObjectURL(this.cache.get(oldest)!);
        this.cache.delete(oldest);
      }
    }
    return url;
  }

  private playUrl(url: string, job: Job): Promise<void> {
    const audio = this.ensureAudio();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        this.stopPlayback = null;
      };
      this.stopPlayback = () => {
        audio.pause();
        cleanup();
        resolve();
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error('Audio playback failed'));
      };
      audio.src = url;
      audio.play().catch((err: unknown) => {
        cleanup();
        if (job.cancelled) resolve();
        else reject(err instanceof Error ? err : new Error('Playback blocked — tap to enable audio'));
      });
    });
  }

  private pickBrowserVoice(): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'));
    const prefer = [/natural/i, /google us english/i, /samantha/i, /aria/i, /jenny/i, /ava/i, /en-us/i];
    for (const re of prefer) {
      const hit = voices.find((v) => re.test(v.name) || re.test(v.lang));
      if (hit) return hit;
    }
    return voices[0];
  }

  private async speakBrowser(job: Job): Promise<void> {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const voice = this.pickBrowserVoice();
    // Chrome cuts long utterances off, so speak sentence by sentence.
    for (const chunk of sentences(job.text)) {
      if (job.cancelled) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.rate = 1.02;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        this.stopPlayback = () => {
          synth.cancel();
          resolve();
        };
        synth.speak(u);
      });
    }
    this.stopPlayback = null;
  }
}

export const speech = new SpeechChannel();
