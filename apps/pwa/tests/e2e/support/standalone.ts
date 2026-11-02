import type { Page } from '@playwright/test';

/**
 * Emulate an installed/standalone PWA before the app boots: force
 * `matchMedia('(display-mode: standalone)')` to match and `navigator.standalone`
 * to true (the two signals `getIsStandalone()` reads). Playwright cannot truly
 * install a PWA; this covers presence/absence of the install step. Real
 * installability is device QA (T2/T3). Call before the authenticating navigation.
 */
export async function emulateStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string): MediaQueryList => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
        } as unknown as MediaQueryList;
      }
      return original(query);
    }) as typeof window.matchMedia;
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
  });
}
