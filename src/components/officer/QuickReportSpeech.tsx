import { useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../lib/api';

export interface QuickResult {
  transcript: string;
  incident_type?: string;
  description?: string;
  location_hint?: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function QuickReportSpeech({ onResult }: { onResult: (r: QuickResult) => void }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleStop(recorder.mimeType);
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone permission is needed for tap-to-speak.');
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  const handleStop = async (mimeType: string) => {
    setProcessing(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      const base64 = await blobToBase64(blob);
      const { text } = await apiFetch<{ text: string }>('/api/transcribe', {
        method: 'POST',
        json: { audio: base64, mimeType: blob.type },
      });
      if (!text) {
        setError('Didn’t catch that — try again.');
        return;
      }

      let result: QuickResult = { transcript: text, description: text };
      try {
        const extracted = await apiFetch<{
          incident_type: string;
          description: string;
          location_hint: string;
        }>('/api/reports/extract', { method: 'POST', json: { transcript: text } });
        result = { transcript: text, ...extracted };
      } catch {
        /* fall back to raw transcript */
      }
      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transcribe the audio.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <button
        onClick={recording ? stop : start}
        disabled={processing}
        className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all ${
          recording
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
            : dark
              ? 'bg-gold-500 text-navy-900 hover:bg-gold-400'
              : 'bg-navy-600 text-white hover:bg-navy-700'
        } ${processing ? 'opacity-80 cursor-wait' : 'active:scale-95'}`}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
      >
        {recording && (
          <span className="absolute inset-0 rounded-full bg-red-500/40 animate-pulse-ring" />
        )}
        {processing ? (
          <Loader2 className="w-10 h-10 animate-spin" />
        ) : recording ? (
          <Square className="w-9 h-9" />
        ) : (
          <Mic className="w-10 h-10" />
        )}
      </button>

      <p className={`mt-4 fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
        {processing
          ? 'Transcribing…'
          : recording
            ? 'Recording — tap to stop'
            : 'Tap, speak your report, tap again to transcribe'}
      </p>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}
