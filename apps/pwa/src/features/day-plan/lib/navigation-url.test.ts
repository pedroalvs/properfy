import { describe, it, expect } from 'vitest';
import { buildNavigationUrl, isApplePlatform } from './navigation-url';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const COORDS = { lat: -33.8836, lng: 151.2108, address: '12 King St, Surry Hills NSW 2010' };

describe('isApplePlatform', () => {
  it('is true for iPhone and iPadOS (Macintosh + touch), false for desktop mac', () => {
    expect(isApplePlatform({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isApplePlatform({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
    expect(isApplePlatform({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isApplePlatform({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('buildNavigationUrl', () => {
  it('builds an Apple Maps URL on iOS with coordinates', () => {
    expect(buildNavigationUrl(COORDS, { userAgent: IPHONE, maxTouchPoints: 5 })).toBe(
      'https://maps.apple.com/?daddr=-33.8836,151.2108&dirflg=d',
    );
  });

  it('builds an Apple Maps URL on iPadOS (Macintosh + maxTouchPoints 5)', () => {
    expect(buildNavigationUrl(COORDS, { userAgent: MAC, maxTouchPoints: 5 })).toBe(
      'https://maps.apple.com/?daddr=-33.8836,151.2108&dirflg=d',
    );
  });

  it('builds a Google Maps URL on desktop mac (maxTouchPoints 0)', () => {
    expect(buildNavigationUrl(COORDS, { userAgent: MAC, maxTouchPoints: 0 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.8836,151.2108&travelmode=driving',
    );
  });

  it('builds a Google Maps URL on Android with coordinates', () => {
    expect(buildNavigationUrl(COORDS, { userAgent: ANDROID, maxTouchPoints: 5 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.8836,151.2108&travelmode=driving',
    );
  });

  it('falls back to the encoded address when there are no coordinates', () => {
    const encoded = encodeURIComponent('12 King St, Surry Hills NSW 2010');
    expect(
      buildNavigationUrl(
        { lat: null, lng: null, address: '12 King St, Surry Hills NSW 2010' },
        { userAgent: ANDROID, maxTouchPoints: 5 },
      ),
    ).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`);
    expect(
      buildNavigationUrl(
        { lat: null, lng: null, address: '12 King St, Surry Hills NSW 2010' },
        { userAgent: IPHONE, maxTouchPoints: 5 },
      ),
    ).toBe(`https://maps.apple.com/?daddr=${encoded}&dirflg=d`);
  });

  it('falls back to the address for out-of-range coordinates', () => {
    const encoded = encodeURIComponent('12 King St, Surry Hills NSW 2010');
    expect(
      buildNavigationUrl({ lat: 999, lng: 151, address: '12 King St, Surry Hills NSW 2010' }, {
        userAgent: ANDROID,
        maxTouchPoints: 5,
      }),
    ).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`);
  });
});
