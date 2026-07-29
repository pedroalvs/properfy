import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { sniffFileKind } from './file-signature';

describe('sniffFileKind', () => {
  it('reports an empty buffer', () => {
    expect(sniffFileKind(Buffer.alloc(0))).toBe('empty');
  });

  it('recognizes a zip container (what an .xlsx actually is)', () => {
    expect(sniffFileKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('zip');
    // Empty and spanned archive variants.
    expect(sniffFileKind(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00]))).toBe('zip');
    expect(sniffFileKind(Buffer.from([0x50, 0x4b, 0x07, 0x08, 0x00]))).toBe('zip');
  });

  it('recognizes a real workbook produced by exceljs as a zip', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').addRow(['Type']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(sniffFileKind(buffer)).toBe('zip');
  });

  it('recognizes an OLE2 compound file (a legacy .xls)', () => {
    const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect(sniffFileKind(ole2)).toBe('ole2');
  });

  it('recognizes a PDF', () => {
    expect(sniffFileKind(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
  });

  it('treats a NUL byte as binary', () => {
    expect(sniffFileKind(Buffer.from([0x54, 0x79, 0x70, 0x65, 0x00, 0x41]))).toBe('binary');
  });

  it('treats plain CSV text as text', () => {
    expect(sniffFileKind(Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n'))).toBe('text');
  });

  it('treats UTF-8 text with a BOM and accents as text', () => {
    expect(sniffFileKind(Buffer.from('\uFEFFType,Suburb\nRoutine,Küçük\n'))).toBe('text');
  });

  it('only scans the head, so a NUL far past the scan window stays text', () => {
    const buffer = Buffer.concat([Buffer.from('a'.repeat(9000)), Buffer.from([0x00])]);
    expect(sniffFileKind(buffer)).toBe('text');
  });
});
