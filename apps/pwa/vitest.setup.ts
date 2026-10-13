import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// heic2any uses Worker and canvas APIs not available in jsdom
vi.mock('heic2any', () => ({
  default: vi.fn().mockRejectedValue(new Error('heic2any not available in test')),
}));

// jsdom does not implement matchMedia. Default to "no match" (phone width) so the
// single-column layout renders in tests; a test that needs the wide layout overrides
// window.matchMedia (see useMediaQuery.test.ts).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
