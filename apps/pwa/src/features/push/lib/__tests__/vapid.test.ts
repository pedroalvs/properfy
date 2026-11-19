import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array, keysEqual } from '../vapid';

describe('urlBase64ToUint8Array', () => {
  it('decodes a URL-safe base64 string that needs padding', () => {
    // "hello" → base64url "aGVsbG8" (length 7, not a multiple of 4)
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(out)).toEqual(Array.from(new TextEncoder().encode('hello')));
  });

  it('decodes a URL-safe base64 string that is already padded-length', () => {
    // "hell" → "aGVsbA==" → base64url "aGVsbA"
    const out = urlBase64ToUint8Array('aGVsbA');
    expect(Array.from(out)).toEqual(Array.from(new TextEncoder().encode('hell')));
  });

  it('translates - and _ back to + and / before decoding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]); // base64 "+/+/" → base64url "-_-_"
    const out = urlBase64ToUint8Array('-_-_');
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('round-trips a realistic VAPID-length key (65 bytes)', () => {
    const src = new Uint8Array(65);
    for (let i = 0; i < src.length; i++) src[i] = (i * 7) % 256;
    let bin = '';
    src.forEach((b) => (bin += String.fromCharCode(b)));
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(Array.from(src));
  });
});

describe('keysEqual', () => {
  const a = new Uint8Array([1, 2, 3, 4]);

  it('returns true for an ArrayBuffer and Uint8Array with the same bytes', () => {
    expect(keysEqual(a.buffer, new Uint8Array([1, 2, 3, 4]))).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(keysEqual(a.buffer, new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('returns false when a byte differs', () => {
    expect(keysEqual(a.buffer, new Uint8Array([1, 2, 3, 5]))).toBe(false);
  });

  it('returns false when either side is null or undefined', () => {
    expect(keysEqual(null, a)).toBe(false);
    expect(keysEqual(a.buffer, null)).toBe(false);
    expect(keysEqual(undefined, undefined)).toBe(false);
  });
});
