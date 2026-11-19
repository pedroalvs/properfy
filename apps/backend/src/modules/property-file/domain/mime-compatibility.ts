/**
 * Decide whether the MIME sniffed from an uploaded object's magic bytes is
 * compatible with the MIME the client declared at presign (F10 C.A5).
 *
 * The confirm step range-fetches only a prefix of the object, so OOXML files
 * (.docx/.xlsx) — ZIP containers whose type marker lives in the central
 * directory at the end of the file — usually sniff as `application/zip`. We
 * accept that for a declared OOXML type while still rejecting a genuinely
 * mismatched signature (e.g. an executable renamed `.pdf`).
 */

const OOXML_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// HEIC and HEIF share the same container signature; treat them as one family.
const HEIC_FAMILY = new Set(['image/heic', 'image/heif']);

/**
 * @param declaredMime the MIME the client declared at presign (already checked
 *   against the configured allow-list).
 * @param detectedMime the MIME `file-type` read from the object's magic bytes,
 *   or `undefined` when it could not identify the bytes.
 */
export function isDetectedMimeCompatible(
  declaredMime: string,
  detectedMime: string | undefined,
): boolean {
  // Unrecognised bytes cannot be verified against the declared type — reject.
  if (!detectedMime) return false;
  if (detectedMime === declaredMime) return true;
  // OOXML container sniffed as a bare ZIP from the prefix.
  if (OOXML_MIMES.has(declaredMime) && detectedMime === 'application/zip') return true;
  // HEIC/HEIF are interchangeable.
  if (HEIC_FAMILY.has(declaredMime) && HEIC_FAMILY.has(detectedMime)) return true;
  return false;
}
