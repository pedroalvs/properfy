import {
  isNativeBannerDismissed,
  dismissNativeBanner,
  isIosBannerDismissed,
  dismissIosBanner,
} from '../install-banner-storage';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

beforeEach(() => {
  mockLocalStorage.clear();
  vi.stubGlobal('localStorage', mockLocalStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('native banner storage', () => {
  it('is not dismissed when no entry exists', () => {
    expect(isNativeBannerDismissed()).toBe(false);
  });

  it('is dismissed immediately after dismissNativeBanner()', () => {
    dismissNativeBanner();
    expect(isNativeBannerDismissed()).toBe(true);
  });

  it('is not suppressed when the dismiss timestamp has expired', () => {
    const expired = Date.now() - THIRTY_DAYS_MS - 1;
    mockLocalStorage.setItem('properfy.installBanner.native.dismissedAt', String(expired));
    expect(isNativeBannerDismissed()).toBe(false);
  });
});

describe('iOS banner storage', () => {
  it('is not dismissed when no entry exists', () => {
    expect(isIosBannerDismissed()).toBe(false);
  });

  it('is dismissed immediately after dismissIosBanner()', () => {
    dismissIosBanner();
    expect(isIosBannerDismissed()).toBe(true);
  });

  it('is not suppressed when the dismiss timestamp has expired', () => {
    const expired = Date.now() - THIRTY_DAYS_MS - 1;
    mockLocalStorage.setItem('properfy.installBanner.ios.dismissedAt', String(expired));
    expect(isIosBannerDismissed()).toBe(false);
  });

  it('native and iOS keys are independent', () => {
    dismissNativeBanner();
    expect(isIosBannerDismissed()).toBe(false);
    expect(isNativeBannerDismissed()).toBe(true);
  });
});
