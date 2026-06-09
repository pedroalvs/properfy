import { fileTypeFromBuffer } from 'file-type';
import sizeOf from 'image-size';
import type { IImageContentVerifier, VerifiedImageInfo } from '../domain/image-content-verifier';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Content-based image verification using magic-byte sniffing + dimension decoding. */
export class ImageContentVerifier implements IImageContentVerifier {
  async verify(buffer: Buffer): Promise<VerifiedImageInfo> {
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new Error(`Image exceeds the 5 MB size limit (got ${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    }

    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
      throw new Error(
        detected
          ? `Image format '${detected.mime}' is not permitted. Allowed: png, jpeg, webp, gif.`
          : 'Could not detect image format. File may be corrupt or not a recognized image.',
      );
    }

    let width: number | null = null;
    let height: number | null = null;
    try {
      const dims = sizeOf(buffer);
      width = dims.width ?? null;
      height = dims.height ?? null;
    } catch {
      // Dimensions unavailable — not a hard failure; still usable
    }

    return {
      contentType: detected.mime as VerifiedImageInfo['contentType'],
      sizeBytes: buffer.length,
      width,
      height,
    };
  }
}
