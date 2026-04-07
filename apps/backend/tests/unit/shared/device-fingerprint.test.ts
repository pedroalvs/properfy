import { describe, it, expect } from 'vitest';
import { computeDeviceFingerprint } from '../../../src/shared/infrastructure/device-fingerprint.service';

describe('computeDeviceFingerprint', () => {
  it('should return null for null input', () => {
    expect(computeDeviceFingerprint(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(computeDeviceFingerprint(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(computeDeviceFingerprint('')).toBeNull();
  });

  it('should return a 16-char hex string', () => {
    const result = computeDeviceFingerprint('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(result).toMatch(/^[a-f0-9]{16}$/);
  });

  it('should produce the same fingerprint for the same user agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.6422.76';
    expect(computeDeviceFingerprint(ua)).toBe(computeDeviceFingerprint(ua));
  });

  it('should produce the same fingerprint for different versions of the same browser', () => {
    const ua1 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.6422.76';
    const ua2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.7000.00';
    expect(computeDeviceFingerprint(ua1)).toBe(computeDeviceFingerprint(ua2));
  });

  it('should produce different fingerprints for completely different agents', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0';
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
    expect(computeDeviceFingerprint(chrome)).not.toBe(computeDeviceFingerprint(safari));
  });
});
