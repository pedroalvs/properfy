import { createHash } from 'crypto';

/**
 * Normalizes a user agent string by stripping version numbers and lowercasing,
 * then returns a 16-char hex prefix of the SHA-256 hash as a device fingerprint.
 */
export function computeDeviceFingerprint(userAgent: string | null | undefined): string | null {
  if (!userAgent) {
    return null;
  }

  // Normalize: lowercase, strip version numbers (sequences of digits/dots after a slash or space)
  const normalized = userAgent
    .toLowerCase()
    .replace(/\/[\d.]+/g, '/') // strip "Chrome/125.0.6422.76" → "Chrome/"
    .replace(/\s[\d.]+/g, ' ') // strip standalone version numbers
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  const hash = createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}
