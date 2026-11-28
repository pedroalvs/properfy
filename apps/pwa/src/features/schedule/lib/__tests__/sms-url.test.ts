import { describe, it, expect } from 'vitest';
import { buildSmsUrl } from '../sms-url';

const APPLE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 };
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 5)', maxTouchPoints: 5 };

describe('buildSmsUrl', () => {
  it('uses the "&" body separator on Apple platforms', () => {
    expect(buildSmsUrl('+61400000000', 'Hello', APPLE)).toBe('sms:+61400000000&body=Hello');
  });

  it('uses the "?" body separator on Android / other platforms', () => {
    expect(buildSmsUrl('+61400000000', 'Hello', ANDROID)).toBe('sms:+61400000000?body=Hello');
  });

  it('URL-encodes the message body', () => {
    const url = buildSmsUrl('+61400000000', "Hi, it's me & you", ANDROID);
    expect(url).toContain('?body=');
    expect(url).toContain(encodeURIComponent("Hi, it's me & you"));
    // The body "&" must be encoded so it is not read as a new parameter.
    expect(url).not.toContain('& you');
  });

  it('strips spaces and punctuation from the number while keeping a leading "+"', () => {
    expect(buildSmsUrl('+61 424 992 725', 'Hi', ANDROID)).toBe('sms:+61424992725?body=Hi');
  });

  it('keeps a local number without a leading "+"', () => {
    expect(buildSmsUrl('0424 992 725', 'Hi', ANDROID)).toBe('sms:0424992725?body=Hi');
  });
});
