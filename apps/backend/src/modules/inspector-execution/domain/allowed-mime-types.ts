export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  PHOTO: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  DOCUMENT: ['application/pdf', 'image/jpeg', 'image/png'],
  SIGNATURE: ['image/png', 'image/svg+xml'],
};

export function isAllowedMimeType(kind: string, mimeType: string): boolean {
  const allowed = ALLOWED_MIME_TYPES[kind];
  if (!allowed) return false;
  return allowed.includes(mimeType);
}
