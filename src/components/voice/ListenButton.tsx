import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { cn } from '../../lib/format';

interface ListenButtonProps {
  /** Text to speak, or a function that builds it on click. */
  text: string | (() => string);
  speechKey: string;
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'pill' | 'icon';
  className?: string;
  /** Speak with this ElevenLabs voice instead of the user's choice (previews). */
  voiceId?: string;
}

/** Reads something aloud with the ElevenLabs voice (browser voice as fallback). */
export default function ListenButton({
  text,
  speechKey,
  label = 'Listen',
  size = 'sm',
  variant = 'pill',
  className,
  voiceId,
}: ListenButtonProps) {
  const { state, speak, stop, unlock } = useVoice();
  const active = state.key === speechKey && (state.speaking || state.loading);
  const loading = active && state.loading;

  const onClick = () => {
    if (active) {
      stop();
      return;
    }
    unlock();
    void speak(typeof text === 'function' ? text() : text, { key: speechKey, interrupt: true, ...(voiceId ? { voiceId } : {}) });
  };

  const icon = loading ? (
    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
  ) : active ? (
    <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
  ) : (
    <Volume2 className="h-4 w-4" aria-hidden />
  );

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={active ? 'Stop reading' : label}
        title={active ? 'Stop' : `${label} (ElevenLabs voice)`}
        className={cn(
          'inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-3 hover:text-ink',
          className,
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (ElevenLabs voice)`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        active
          ? 'border-accent bg-accent-soft text-accent-strong'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {icon}
      {active ? (loading ? 'Preparing…' : 'Stop') : label}
    </button>
  );
}
