import { useEffect, useRef, type MutableRefObject } from 'react';
import { AudioLines, LoaderCircle, Mic, MicOff, PhoneCall } from 'lucide-react';
import { cn } from '../../lib/format';

export type OrbMode = 'idle' | 'connecting' | 'listening' | 'speaking' | 'muted' | 'ended';

interface VoiceOrbProps {
  mode: OrbMode;
  /** Live levels 0…1, updated outside React (no re-render per frame). */
  levels: MutableRefObject<{ user: number; assistant: number }>;
  size?: number;
  className?: string;
}

/**
 * The interviewer "presence": a navy core with gold rings that swell with the
 * interviewer's voice, and a green ring that answers the caller's voice.
 */
export default function VoiceOrb({ mode, levels, size = 220, className }: VoiceOrbProps) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const node = el.current;
      if (node) {
        node.style.setProperty('--a', levels.current.assistant.toFixed(3));
        node.style.setProperty('--u', levels.current.user.toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [levels]);

  const live = mode === 'listening' || mode === 'speaking' || mode === 'muted';
  const Icon =
    mode === 'connecting' ? LoaderCircle : mode === 'speaking' ? AudioLines : mode === 'muted' ? MicOff : mode === 'idle' || mode === 'ended' ? PhoneCall : Mic;

  return (
    <div
      ref={el}
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size, ['--a' as string]: 0, ['--u' as string]: 0 }}
      aria-hidden
    >
      {/* gold aura — the interviewer's voice */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgb(212 181 102 / 0.38) 0%, rgb(212 181 102 / 0.08) 45%, transparent 70%)',
          transform: 'scale(calc(0.85 + var(--a) * 0.45))',
          opacity: live ? 'calc(0.35 + var(--a) * 0.65)' : 0.25,
          transition: 'opacity 0.3s',
        }}
      />
      <div
        className="absolute rounded-full border-2 border-gold-400/70"
        style={{ inset: size * 0.12, transform: 'scale(calc(1 + var(--a) * 0.16))', opacity: live ? 1 : 0.35 }}
      />
      <div
        className="absolute rounded-full border border-gold-300/40"
        style={{ inset: size * 0.05, transform: 'scale(calc(1 + var(--a) * 0.08))', opacity: live ? 0.8 : 0.2 }}
      />
      {/* green ring — the caller's voice */}
      <div
        className="absolute rounded-full border-[3px] border-emerald-400"
        style={{
          inset: size * 0.2,
          transform: 'scale(calc(1 + var(--u) * 0.32))',
          opacity: mode === 'listening' ? 'calc(var(--u) * 1.4)' : 0,
        }}
      />
      {/* core */}
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-full shadow-[0_18px_50px_-12px_rgb(11_18_34/0.7)]',
          mode === 'connecting' && 'animate-pulse',
        )}
        style={{
          width: size * 0.52,
          height: size * 0.52,
          background: 'radial-gradient(120% 120% at 30% 20%, #2f5580 0%, #1b2a4a 45%, #0b1222 100%)',
          transform: 'scale(calc(1 + var(--a) * 0.06))',
        }}
      >
        <div
          className={cn('absolute inset-0', live && 'animate-[spin_9s_linear_infinite]')}
          style={{ background: 'conic-gradient(from 0deg, transparent 0%, rgb(212 181 102 / 0.28) 18%, transparent 36%)' }}
        />
        <Icon className={cn('relative h-10 w-10 text-gold-300', mode === 'connecting' && 'animate-spin')} />
      </div>
    </div>
  );
}
