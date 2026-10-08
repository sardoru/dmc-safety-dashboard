import { useRef } from 'react';
import { Camera, X } from 'lucide-react';
import { MAX_PHOTOS } from '../../lib/media';
import { useIncidents } from '../../context/IncidentContext';

interface PhotoPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
}

// One preview URL per File, reused across renders (revoked when the photo is removed).
const previewUrls = new WeakMap<File, string>();
function previewUrl(file: File): string {
  let url = previewUrls.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    previewUrls.set(file, url);
  }
  return url;
}

/** Up to four photos (camera on phones). Compressed before upload. */
export default function PhotoPicker({ files, onChange }: PhotoPickerProps) {
  const { caps } = useIncidents();
  const input = useRef<HTMLInputElement>(null);
  const previews = files.map((f) => ({ file: f, url: previewUrl(f) }));

  // The photo bucket arrives with database migration 0002.
  if (caps.checked && !caps.v2) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-[13px] text-muted">
        Photo attachments aren’t switched on for this dashboard yet — describe what you saw instead.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {previews.map((p, idx) => (
          <div key={p.url} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-3">
            <img src={p.url} alt={`Attached photo ${idx + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(p.url);
                previewUrls.delete(p.file);
                onChange(files.filter((f) => f !== p.file));
              }}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label={`Remove photo ${idx + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-accent-strong"
          >
            <Camera className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Add photo</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
          onChange([...files, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = '';
        }}
      />
      <p className="mt-2 text-[12px] text-subtle">Photos go to officers only — never shown to other businesses. Don’t put yourself at risk to take one.</p>
    </div>
  );
}
