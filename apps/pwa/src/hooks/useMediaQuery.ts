import { useEffect, useState } from 'react';

/**
 * Minimum viewport width (px) at which the shell switches from the validated
 * single-column phone stack to the adaptive 2-column master-detail layout.
 * Mirrors Tailwind's `md` breakpoint — keep the two in sync (the layout itself is
 * driven by `md:` utility classes; this constant is only for the rare JS branch
 * that cannot be expressed in CSS, e.g. overlay-sheet vs inline-pane selection).
 */
export const TABLET_MIN_WIDTH = 768;

/**
 * Subscribe to a CSS media query. SSR/jsdom-safe: returns `false` when
 * `matchMedia` is unavailable, and re-renders on viewport changes.
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Sync once on mount in case the query resolved differently before hydration.
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * True at tablet / foldable-open widths (Tailwind `md`, ≥768px), where the PWA
 * presents the 2-column master-detail layout. Below it, the phone single-column
 * experience is unchanged.
 */
export function useIsWide(): boolean {
  return useMediaQuery(`(min-width: ${TABLET_MIN_WIDTH}px)`);
}
