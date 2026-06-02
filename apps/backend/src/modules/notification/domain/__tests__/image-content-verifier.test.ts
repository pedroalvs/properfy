import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IImageContentVerifier } from '../image-content-verifier';

async function loadImpl(): Promise<IImageContentVerifier> {
  const mod = await import('../../infrastructure/image-content-verifier');
  return new mod.ImageContentVerifier();
}

// Minimal valid PNG (1×1 pixel, 67 bytes)
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e0000000c4944415478016360f8cf000000020001e221bc330000000049454e44ae426082',
  'hex',
);

// SVG disguised as image (should be rejected)
const SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');

// Random non-image bytes
const RANDOM_BUFFER = Buffer.from('This is not an image file at all!!!');

describe('ImageContentVerifier', () => {
  it('should accept a valid PNG buffer and return correct metadata', async () => {
    const verifier = await loadImpl();
    const result = await verifier.verify(MINIMAL_PNG);
    expect(result.contentType).toBe('image/png');
    expect(result.sizeBytes).toBe(MINIMAL_PNG.length);
    expect(result.width).toBeGreaterThan(0);
  });

  it('should reject SVG content', async () => {
    const verifier = await loadImpl();
    await expect(verifier.verify(SVG_BUFFER)).rejects.toThrow();
  });

  it('should reject non-image bytes', async () => {
    const verifier = await loadImpl();
    await expect(verifier.verify(RANDOM_BUFFER)).rejects.toThrow();
  });

  it('should reject a buffer exceeding 5 MB', async () => {
    const verifier = await loadImpl();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(verifier.verify(oversized)).rejects.toThrow(/5 MB/i);
  });
});
