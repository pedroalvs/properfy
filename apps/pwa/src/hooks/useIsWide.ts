import { useEffect, useState } from 'react';

/**
 * True on tablet/landscape and wider (≥1024px) — the viewport where the
 * marketplace shows the extended map + list layout. The PWA is mobile-first;
 * below this width every screen stays single-column.
 *
 * Guarded for environments without `matchMedia` (jsdom in unit tests, SSR):
 * it reports `false` (narrow) there, so the default experience is the phone one.
 */
export function useIsWide(query = '(min-width: 1024px)'): boolean {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [isWide, setIsWide] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const handler = () => setIsWide(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return isWide;
}
