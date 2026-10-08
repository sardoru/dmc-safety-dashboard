import { useEffect, useState } from 'react';
import type { Priority } from '../../types';
import { PRIORITIES } from '../../lib/taxonomy';

/**
 * Chart colour roles for the Insights page. Each role is a CSS custom property
 * defined light + dark on the page wrapper (VIZ_THEME), so the charts switch
 * with the app theme without any `dark ? x : y` logic.
 *
 * - Single series (bar lists): one blue from the brand-navy hue family,
 *   stepped per mode — #1c5cab on light (6.6:1 vs card), #6da7ec on dark (7.5:1).
 * - Heatmap: one-hue sequential ramp, light→dark on light surfaces and
 *   flipped (dark→bright) on dark. Both ramps pass the ordinal checks of the
 *   dataviz validator: monotone lightness, ΔL ≥ 0.06, single hue, and the
 *   faintest step ≥ 2:1 against the card.
 * - Priorities use the app-wide PRIORITIES hex (same as map pins and badges).
 *   They are a severity scale, not a free categorical palette, so charts
 *   always pair them with P-labels, a fixed stack order, 2px surface gaps,
 *   tooltips and a table view.
 */
export const VIZ_THEME = [
  '[--viz-bar:#1c5cab] dark:[--viz-bar:#6da7ec]',
  '[--viz-heat-1:#86b6ef] [--viz-heat-2:#3987e5] [--viz-heat-3:#1c5cab] [--viz-heat-4:#0d366b]',
  'dark:[--viz-heat-1:#184f95] dark:[--viz-heat-2:#2a78d6] dark:[--viz-heat-3:#6da7ec] dark:[--viz-heat-4:#b7d3f6]',
].join(' ');

export const BAR_FILL = 'var(--viz-bar)';

export const HEAT_FILL = [
  'var(--surface-3)',
  'var(--viz-heat-1)',
  'var(--viz-heat-2)',
  'var(--viz-heat-3)',
  'var(--viz-heat-4)',
] as const;

export function priorityColor(p: Priority): string {
  return PRIORITIES[p].hex;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Content-box size of an element, kept current with a ResizeObserver. Charts
 * draw at real pixel sizes (crisp hairlines, unscaled text) instead of
 * stretching a viewBox.
 */
export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, Size] {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, size];
}
