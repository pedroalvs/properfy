/** Result of content-based image verification. */
export interface VerifiedImageInfo {
  /** Server-verified MIME type (never the client-declared type). */
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Port for content-based image validation.
 * Uses magic-byte sniffing and dimension decoding — NOT MIME headers from the client.
 */
export interface IImageContentVerifier {
  /**
   * Verifies that the buffer is a permitted raster image (png/jpeg/webp/gif),
   * is ≤ 5 MB, and is not an SVG or non-image format.
   *
   * Throws an error with a human-readable reason on rejection.
   */
  verify(buffer: Buffer): Promise<VerifiedImageInfo>;
}
