import { describe, it, expect } from 'vitest';
import { resolvePwaUrl, PWA_URL_DEV_FALLBACK } from './resolve-pwa-url';

describe('resolvePwaUrl', () => {
  it('maps each deployed API host to the matching app URL', () => {
    expect(resolvePwaUrl(undefined, 'https://properfy-api-dev.fly.dev')).toBe(
      'https://pwa-properfy.pedroalvs.com',
    );
    expect(resolvePwaUrl(undefined, 'https://api-properfy.autolabs.tech')).toBe(
      'https://pwa-properfy.autolabs.tech',
    );
    expect(resolvePwaUrl(undefined, 'https://api.properfy.me')).toBe('https://pwa.properfy.me');
  });

  it('ignores the API path/query when mapping (keys on host only)', () => {
    expect(resolvePwaUrl(undefined, 'https://api.properfy.me/v1?x=1')).toBe(
      'https://pwa.properfy.me',
    );
  });

  it('lets an explicit override win over the derived value', () => {
    expect(resolvePwaUrl('https://custom.example', 'https://api.properfy.me')).toBe(
      'https://custom.example',
    );
  });

  it('ignores an empty or whitespace-only override and derives instead', () => {
    expect(resolvePwaUrl('', 'https://api.properfy.me')).toBe('https://pwa.properfy.me');
    expect(resolvePwaUrl('   ', 'https://api.properfy.me')).toBe('https://pwa.properfy.me');
  });

  it('returns the local dev server for a LOCAL API host', () => {
    expect(resolvePwaUrl(undefined, 'http://localhost:3000')).toBe(PWA_URL_DEV_FALLBACK);
    expect(resolvePwaUrl(undefined, 'http://127.0.0.1:3000')).toBe(PWA_URL_DEV_FALLBACK);
  });

  it('returns the local dev server when the API URL is absent or empty', () => {
    expect(resolvePwaUrl(undefined, undefined)).toBe(PWA_URL_DEV_FALLBACK);
    expect(resolvePwaUrl(undefined, '')).toBe(PWA_URL_DEV_FALLBACK);
    expect(resolvePwaUrl(undefined, '   ')).toBe(PWA_URL_DEV_FALLBACK);
  });

  it('returns "" for a PUBLISHED but UNKNOWN API host (→ disabled button, never a broken localhost link)', () => {
    expect(resolvePwaUrl(undefined, 'https://api.example.com')).toBe('');
    expect(resolvePwaUrl(undefined, 'https://some-preview.fly.dev')).toBe('');
  });

  it('returns "" for a malformed API URL that is not clearly local', () => {
    expect(resolvePwaUrl(undefined, 'not a url')).toBe('');
  });

  it('the local dev fallback is a localhost URL', () => {
    expect(PWA_URL_DEV_FALLBACK).toMatch(/^http:\/\/localhost/);
  });
});
