import { useState, type ReactNode } from 'react';
import { BRAND_IMAGES, optimizedUrl, srcSet, type BrandImageName } from '../../lib/brand';
import { cn } from '../../lib/format';

interface BrandImageProps {
  name: BrandImageName;
  /** Largest CSS width it renders at — picks the optimized size. */
  width: number;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Rendered instead if the image can't load. */
  fallback?: ReactNode;
}

/** A Higgsfield brand image with responsive sizes, a fade-in and a graceful fallback. */
export default function BrandImage({ name, width, alt, className, sizes, priority, fallback }: BrandImageProps) {
  const img = BRAND_IMAGES[name];
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (state === 'failed') return <>{fallback ?? null}</>;
  const widths = [Math.round(width / 2), width, Math.min(width * 2, 2560)].filter((w, i, a) => a.indexOf(w) === i);
  return (
    <img
      src={optimizedUrl(img.src, width)}
      srcSet={srcSet(img.src, widths)}
      sizes={sizes ?? `${width}px`}
      alt={alt}
      width={img.width}
      height={img.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
      className={cn('transition-opacity duration-700', state === 'loaded' ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}
