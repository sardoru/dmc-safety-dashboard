import { useEffect, useState } from 'react';
import { resolvePhotoUrls } from '../../lib/media';
import { Dialog } from '../ui/Overlay';

/** Thumbnail for a notice's photo (signed URL when stored privately, data URL in demo). */
export default function BoloPhoto({ photoRef, title }: { photoRef: string; title: string }) {
  const [resolved, setResolved] = useState<{ ref: string; url: string | null } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolvePhotoUrls([photoRef])
      .then((urls) => {
        if (!cancelled) setResolved({ ref: photoRef, url: urls[0] ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolved({ ref: photoRef, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [photoRef]);

  const url = resolved?.ref === photoRef ? resolved.url : undefined;
  if (url === null) return null;
  if (url === undefined) return <div className="skeleton h-14 w-14 flex-shrink-0 rounded-xl" aria-hidden />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-line bg-surface-3"
        aria-label={`View photo for ${title}`}
      >
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <img src={url} alt={`Photo attached to the lookout notice: ${title}`} className="mx-auto max-h-[70dvh] rounded-xl object-contain" />
      </Dialog>
    </>
  );
}
