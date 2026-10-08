import { useEffect, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { resolvePhotoUrls } from '../../lib/media';
import { createPortal } from 'react-dom';

/** Report photos (signed URLs for private storage; data URLs in demo). */
export default function PhotoGallery({ refs }: { refs: string[] }) {
  const key = refs.join('|');
  const [resolved, setResolved] = useState<{ key: string; urls: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!refs.length) return;
    let cancelled = false;
    resolvePhotoUrls(refs)
      .then((urls) => {
        if (!cancelled) setResolved({ key, urls });
      })
      .catch(() => {
        if (!cancelled) setResolved({ key, urls: [] });
      });
    return () => {
      cancelled = true;
    };
    // refs identity changes every render; the joined key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!refs.length) return null;
  const urls = resolved?.key === key ? resolved.urls : null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {urls === null
          ? refs.map((r) => <div key={r} className="skeleton aspect-square rounded-xl" />)
          : urls.length === 0
            ? (
              <p className="col-span-full flex items-center gap-2 text-[13px] text-muted">
                <ImageOff className="h-4 w-4" /> Photos are only visible to officers and the reporter.
              </p>
            )
            : urls.map((u, idx) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setOpen(u)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-3"
                  aria-label={`Open photo ${idx + 1}`}
                >
                  <img src={u} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                </button>
              ))}
      </div>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
            <img src={open} alt="Report photo" className="max-h-full max-w-full rounded-xl object-contain" />
            <button
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => setOpen(null)}
              aria-label="Close photo"
            >
              <X className="h-5 w-5" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
