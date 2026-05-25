import { getIsIosSafariEligible } from '../useInstallPrompt';

function withUA(ua: string, standalone: boolean, fn: () => void) {
  const originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  const originalStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');

  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });

  try {
    fn();
  } finally {
    if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA);
    if (originalStandalone) Object.defineProperty(navigator, 'standalone', originalStandalone);
    else delete (navigator as Navigator & { standalone?: boolean }).standalone;
  }
}

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const CHROME_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';

const FIREFOX_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1';

const DESKTOP_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const FIREFOX_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0';

describe('getIsIosSafariEligible', () => {
  it('returns true for iOS Safari non-standalone', () => {
    withUA(IOS_SAFARI_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(true);
    });
  });

  it('returns false for iOS Safari when standalone (already installed)', () => {
    withUA(IOS_SAFARI_UA, true, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });

  it('returns false for Chrome on iOS (uses CriOS)', () => {
    withUA(CHROME_IOS_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });

  it('returns false for Firefox on iOS (uses FxiOS)', () => {
    withUA(FIREFOX_IOS_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });

  it('returns false for desktop Safari', () => {
    withUA(DESKTOP_SAFARI_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });

  it('returns false for Android Chrome', () => {
    withUA(ANDROID_CHROME_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });

  it('returns false for Firefox desktop', () => {
    withUA(FIREFOX_DESKTOP_UA, false, () => {
      expect(getIsIosSafariEligible()).toBe(false);
    });
  });
});
