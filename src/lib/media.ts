import { supabase } from './supabase';
import { generateId } from './format';

export const MEDIA_BUCKET = 'report-media';
export const MAX_PHOTOS = 4;

/** Downscale + re-encode a photo to JPEG so uploads stay small on cell data. */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Only images can be attached');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    // HEIC on browsers that can't decode it, etc. — upload as-is.
    return file;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Upload report photos to `<uid>/<uuid>.jpg` in the private bucket; returns storage paths. */
export async function uploadReportPhotos(files: File[], userId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files.slice(0, MAX_PHOTOS)) {
    const blob = await compressImage(file);
    const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/${generateId()}.${ext}`;
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
      contentType: blob.type || file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

/** Demo mode: keep photos inline as compressed data URLs. */
export async function photosToDataUrls(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files.slice(0, MAX_PHOTOS)) {
    out.push(await blobToDataUrl(await compressImage(file, 1200, 0.78)));
  }
  return out;
}

const signedCache = new Map<string, { url: string; expires: number }>();

/** Resolve stored photo references to displayable URLs (data URLs pass through). */
export async function resolvePhotoUrls(refs: string[]): Promise<string[]> {
  const now = Date.now();
  const need = refs.filter(
    (r) => !r.startsWith('data:') && !r.startsWith('http') && (signedCache.get(r)?.expires ?? 0) <= now,
  );
  if (need.length) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(need, 3600);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signedCache.set(item.path, { url: item.signedUrl, expires: now + 55 * 60_000 });
      }
    }
  }
  return refs
    .map((r) => (r.startsWith('data:') || r.startsWith('http') ? r : signedCache.get(r)?.url ?? ''))
    .filter(Boolean);
}
