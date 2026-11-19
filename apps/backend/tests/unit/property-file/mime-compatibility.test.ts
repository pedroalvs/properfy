import { describe, it, expect } from 'vitest';
import { isDetectedMimeCompatible } from '../../../src/modules/property-file/domain/mime-compatibility';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('isDetectedMimeCompatible (F10 C.A5)', () => {
  it('accepts an exact match', () => {
    expect(isDetectedMimeCompatible('image/jpeg', 'image/jpeg')).toBe(true);
    expect(isDetectedMimeCompatible('application/pdf', 'application/pdf')).toBe(true);
    expect(isDetectedMimeCompatible('image/png', 'image/png')).toBe(true);
  });

  it('accepts an OOXML declared type sniffed as application/zip (prefix-only)', () => {
    expect(isDetectedMimeCompatible(DOCX, 'application/zip')).toBe(true);
    expect(isDetectedMimeCompatible(XLSX, 'application/zip')).toBe(true);
    // and the exact OOXML detection when the full file is read
    expect(isDetectedMimeCompatible(DOCX, DOCX)).toBe(true);
  });

  it('treats HEIC and HEIF as the same family', () => {
    expect(isDetectedMimeCompatible('image/heic', 'image/heif')).toBe(true);
    expect(isDetectedMimeCompatible('image/heic', 'image/heic')).toBe(true);
  });

  it('rejects a genuine mismatch (spoofed content-type)', () => {
    // an executable renamed .pdf sniffs as neither pdf nor zip
    expect(isDetectedMimeCompatible('application/pdf', 'application/x-msdownload')).toBe(false);
    expect(isDetectedMimeCompatible('image/png', 'image/jpeg')).toBe(false);
    // a plain image is NOT a zip, so it cannot pass as a docx
    expect(isDetectedMimeCompatible(DOCX, 'image/jpeg')).toBe(false);
    // a bare zip is not acceptable for a declared pdf
    expect(isDetectedMimeCompatible('application/pdf', 'application/zip')).toBe(false);
  });

  it('rejects when the bytes could not be identified', () => {
    expect(isDetectedMimeCompatible('application/pdf', undefined)).toBe(false);
    expect(isDetectedMimeCompatible(DOCX, undefined)).toBe(false);
  });
});
