import { describe, it, expect } from 'vitest';
import { PdfReportGenerator } from '../../../src/modules/report/infrastructure/pdf-report-generator';
import type { ReportColumn } from '../../../src/modules/report/domain/xlsx-generator';

describe('PdfReportGenerator', () => {
  const generator = new PdfReportGenerator();

  const columns: ReportColumn[] = [
    { key: 'id', label: 'ID', width: 36 },
    { key: 'name', label: 'Name', width: 25 },
  ];

  it('generates a buffer starting with %PDF-1.4', async () => {
    const rows = [{ id: '1', name: 'Alice' }];

    const buffer = await generator.generate(columns, rows);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString('utf-8').startsWith('%PDF-1.4')).toBe(true);
  });

  it('generates a buffer ending with %%EOF', async () => {
    const rows = [{ id: '1', name: 'Alice' }];

    const buffer = await generator.generate(columns, rows);
    const content = buffer.toString('utf-8');

    expect(content.trimEnd()).toMatch(/%%EOF$/);
  });

  it('includes report data in the PDF stream', async () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];

    const buffer = await generator.generate(columns, rows);
    const content = buffer.toString('utf-8');

    expect(content).toContain('Alice');
    expect(content).toContain('Bob');
    expect(content).toContain('ID');
    expect(content).toContain('Name');
  });

  it('handles zero rows', async () => {
    const buffer = await generator.generate(columns, []);
    const content = buffer.toString('utf-8');

    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('ID');
    expect(content).toContain('Name');
  });

  it('returns correct content type', () => {
    expect(generator.contentType()).toBe('application/pdf');
  });

  it('returns correct file extension', () => {
    expect(generator.fileExtension()).toBe('pdf');
  });
});
