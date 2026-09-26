export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  PHOTO: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  DOCUMENT: ['application/pdf', 'image/jpeg', 'image/png'],
  // Signature pads emit PNG. image/svg+xml is intentionally excluded: an inline
  // SVG can carry <script> / event handlers and become stored XSS when served
  // inline (#318). Do not re-add it without a sanitize-on-ingest pipeline.
  SIGNATURE: ['image/png'],
};

export function isAllowedMimeType(kind: string, mimeType: string): boolean {
  const allowed = ALLOWED_MIME_TYPES[kind];
  if (!allowed) return false;
  return allowed.includes(mimeType);
}
