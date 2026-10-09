/**
 * Brand imagery. The skyline is a photograph of Downtown Memphis supplied by
 * the owner (public/brand/memphis-skyline.jpg; keep its credit mark), and so is
 * the Main Street picture (public/brand/main-street-orpheum.jpg). The
 * illustrations were generated with Higgsfield and live on its CDN.
 *
 * In production every image is served through Vercel's Image Optimization API
 * (`/_vercel/image`, configured in vercel.json → `images`), which resizes,
 * converts to AVIF/WebP and caches at the edge. Every place that shows one has
 * a gradient fallback, so a slow or missing image never breaks the layout.
 */
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3DNAZXDOkIMfSZFDtMpE2N86TGI';
const SKYLINE = { src: '/brand/memphis-skyline.jpg', width: 2000, height: 918 };

export const BRAND_IMAGES = {
  /** Downtown Memphis at sunset over the Mississippi (photo). */
  skyline: SKYLINE,
  /** The same photo where a wide river-city panorama is shown. */
  panorama: SKYLINE,
  /** Main Street at night: the trolley under the Orpheum sign (4:5; supplied by the owner, 2026-10-09). */
  mainStreet: { src: '/brand/main-street-orpheum.jpg', width: 1122, height: 1402 },
  /** Shop owner reporting by phone. */
  illoReport: { src: `${CDN}/hf_20261008_170523_1eba0bdd-f4ef-42eb-b395-120bdb0b6e38.png`, width: 1024, height: 1024 },
  /** Officer monitoring the map. */
  illoMonitor: { src: `${CDN}/hf_20261008_170523_af099174-97a6-4938-ac78-49acc3048af8.png`, width: 1024, height: 1024 },
  /** Storefronts linked under a shield. */
  illoCommunity: { src: `${CDN}/hf_20261008_170523_c0a7edfc-449e-4ad2-9eeb-f0cd586dc8a4.png`, width: 1024, height: 1024 },
  /** Quiet street, all clear. */
  illoAllClear: { src: `${CDN}/hf_20261008_170525_67b05e9b-c717-46e4-b3fe-26a87cfb7046.png`, width: 1024, height: 1024 },
  /** Two-way voice interview. */
  illoVoice: { src: `${CDN}/hf_20261008_170526_3f9c73df-5137-47f1-8ee2-e6a9aa092cf5.png`, width: 1024, height: 1024 },
  /** Be-on-the-lookout board. */
  illoLookout: { src: `${CDN}/hf_20261008_170522_2653cc77-cf60-4966-a739-f4f365ccf7df.png`, width: 1024, height: 1024 },
} as const;

export type BrandImageName = keyof typeof BRAND_IMAGES;

/** Widths allowed by vercel.json → images.sizes. */
export const IMAGE_SIZES = [256, 384, 640, 828, 1080, 1280, 1600, 1920, 2560] as const;
const QUALITY = 75;

const useOptimizer = import.meta.env.PROD && import.meta.env.VITE_IMAGE_OPTIMIZER !== 'off';

export function optimizedUrl(src: string, width: number): string {
  if (!useOptimizer) return src;
  const w = IMAGE_SIZES.find((s) => s >= width) ?? IMAGE_SIZES[IMAGE_SIZES.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(src)}&w=${w}&q=${QUALITY}`;
}

export function srcSet(src: string, widths: readonly number[]): string | undefined {
  if (!useOptimizer) return undefined;
  return widths.map((w) => `${optimizedUrl(src, w)} ${w}w`).join(', ');
}
