import { useState } from 'react';
import { Headphones, LoaderCircle, Play, RotateCcw, Sparkles, Square } from 'lucide-react';
import { useIncidents } from '../../context/IncidentContext';
import { useBolos } from '../../context/BoloContext';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { apiFetch } from '../../lib/api';
import { templateBriefing } from '../../lib/announce';
import { categoryMeta, STATUSES } from '../../lib/taxonomy';
import { shortAddress, timeAgo } from '../../lib/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Overlay';
import { Segmented } from '../ui/Form';

const WINDOWS = [
  { value: '4', label: '4h' },
  { value: '12', label: '12h' },
  { value: '24', label: '24h' },
] as const;

/**
 * Shift briefing: an AI-written (OpenAI) summary of the recent incidents and
 * BOLOs, read aloud with the ElevenLabs voice. Falls back to a deterministic
 * template when the writer isn't available.
 */
export default function BriefingPlayer({ compact }: { compact?: boolean }) {
  const { incidents } = useIncidents();
  const { activeBolos } = useBolos();
  const { isDemo } = useAuth();
  const { speak, stop, state, unlock, voiceLabel } = useVoice();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowHours, setWindowHours] = useState<'4' | '12' | '24'>('12');

  const playing = state.key === 'briefing' && (state.speaking || state.loading);

  const generate = async (hours = windowHours) => {
    unlock();
    setOpen(true);
    setLoading(true);
    stop();
    const now = Date.now();
    const h = Number(hours);
    let briefing = '';
    let src: 'ai' | 'template' = 'template';
    if (!isDemo) {
      try {
        const digest = incidents
          .filter((i) => now - i.createdAt <= h * 3_600_000)
          .slice(0, 60)
          .map((i) => ({
            ref: i.ref,
            category: categoryMeta(i.category).label,
            priority: i.priority,
            status: STATUSES[i.status].label,
            title: i.title,
            location: shortAddress(i.address),
            minutesAgo: Math.round((now - i.createdAt) / 60_000),
            reporter: i.reporterName,
          }));
        const bolos = activeBolos.map((b) => ({
          title: b.title,
          lastSeen: b.lastSeenLocation
            ? `${shortAddress(b.lastSeenLocation)}, ${timeAgo(b.lastSeenAt ?? b.createdAt, now)}`
            : undefined,
          sightings: b.sightings,
        }));
        const res = await apiFetch<{ text: string }>('/api/briefing', {
          method: 'POST',
          json: { windowHours: h, incidents: digest, bolos },
        });
        if (res.text) {
          briefing = res.text;
          src = 'ai';
        }
      } catch {
        /* fall back to the template */
      }
    }
    if (!briefing) briefing = templateBriefing(incidents, activeBolos, h, now);
    setText(briefing);
    setSource(src);
    setLoading(false);
    void speak(briefing, { key: 'briefing', interrupt: true });
  };

  return (
    <>
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        icon={<Headphones className="h-4 w-4" />}
        onClick={() => void generate()}
        aria-label="Shift briefing"
        title="Play an AI shift briefing (ElevenLabs voice)"
      >
        <span className={compact ? 'hidden md:inline' : undefined}>Shift briefing</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          if (playing) stop();
        }}
        title="Shift briefing"
        description={
          source === 'ai'
            ? `Written by AI from the last ${windowHours} hours · voice: ${voiceLabel}`
            : `Summary of the last ${windowHours} hours · voice: ${voiceLabel}`
        }
        icon={<Headphones className="h-5 w-5" />}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => void generate()}
              disabled={loading}
            >
              Regenerate
            </Button>
            {playing ? (
              <Button size="sm" variant="secondary" icon={<Square className="h-3.5 w-3.5 fill-current" />} onClick={stop}>
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<Play className="h-4 w-4" />}
                disabled={!text || loading}
                onClick={() => void speak(text, { key: 'briefing', interrupt: true })}
              >
                Play
              </Button>
            )}
          </>
        }
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <Segmented
            label="Briefing window"
            size="sm"
            value={windowHours}
            onChange={(v) => {
              setWindowHours(v);
              void generate(v);
            }}
            options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
          {source === 'ai' && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-strong">
              <Sparkles className="h-3.5 w-3.5" /> AI summary
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> Preparing the briefing…
          </div>
        ) : (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{text}</p>
        )}
      </Dialog>
    </>
  );
}
