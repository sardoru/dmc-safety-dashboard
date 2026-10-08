import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

type DictationState = 'idle' | 'recording' | 'transcribing';

/** Stop and transcribe on our own at 3 minutes (~1.4 MB at 64 kbps), well under the upload limit. */
const MAX_RECORDING_MS = 3 * 60_000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Tap-to-dictate: record a clip, transcribe it with OpenAI on our server
 * (`/api/transcribe`) and hand back the text.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const capTimer = useRef<number | undefined>(undefined);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(
    () => () => {
      window.clearTimeout(capTimer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const finish = useCallback(async (mimeType: string) => {
    setState('transcribing');
    try {
      const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' });
      if (blob.size < 1200) throw new Error('That was too short — hold the button a little longer.');
      const audio = await blobToBase64(blob);
      const { text } = await apiFetch<{ text: string }>('/api/transcribe', {
        method: 'POST',
        json: { audio, mimeType: blob.type },
      });
      if (!text?.trim()) throw new Error('Didn’t catch that — try again.');
      onTextRef.current(text.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transcribe the recording.');
    } finally {
      setState('idle');
    }
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        window.clearTimeout(capTimer.current);
        s.getTracks().forEach((t) => t.stop());
        void finish(rec.mimeType);
      };
      recorder.current = rec;
      rec.start();
      capTimer.current = window.setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, MAX_RECORDING_MS);
      setState('recording');
    } catch {
      setError('Microphone access is needed to dictate.');
      setState('idle');
    }
  }, [finish]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (state === 'recording') stop();
    else if (state === 'idle') void start();
  }, [state, start, stop]);

  return { state, error, start, stop, toggle };
}
