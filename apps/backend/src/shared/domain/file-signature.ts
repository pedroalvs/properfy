/**
 * Leading-byte content sniffing. The only defence against an upload whose
 * extension lies about its contents — a `.xlsx` that is really a PDF, or a
 * `.csv` that is really a workbook. Without it those files reach the format
 * parser, which fails with an opaque low-level error.
 */

export type SniffedFileKind = 'empty' | 'zip' | 'ole2' | 'pdf' | 'binary' | 'text';

/** How far into the file we look for a NUL when deciding text vs binary. */
const BINARY_SCAN_BYTES = 8192;

/** Local file header, empty archive and spanned archive — the three ways a
 * zip can legitimately begin. `.xlsx` is a zip container. */
const ZIP_SECOND_PAIR = [
  [0x03, 0x04],
  [0x05, 0x06],
  [0x07, 0x08],
];

/** OLE2 compound document, i.e. a legacy `.xls` (and `.doc`, `.msg`, …). */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

export function sniffFileKind(buffer: Buffer): SniffedFileKind {
  if (buffer.length === 0) return 'empty';

  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    if (ZIP_SECOND_PAIR.some(([a, b]) => buffer[2] === a && buffer[3] === b)) return 'zip';
  }
  if (startsWith(buffer, OLE2_SIGNATURE)) return 'ole2';
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf';

  // A NUL byte never appears in UTF-8 text, so it is a reliable binary tell.
  // Bounded scan: a huge CSV should not cost a full pass just to classify it.
  const scanEnd = Math.min(buffer.length, BINARY_SCAN_BYTES);
  if (buffer.subarray(0, scanEnd).includes(0x00)) return 'binary';

  return 'text';
}
