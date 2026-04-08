import { describe, it, expect } from 'vitest';
import { CsvReportGenerator } from '../../../src/modules/report/infrastructure/csv-report-generator';
import type { ReportColumn } from '../../../src/modules/report/domain/xlsx-generator';

describe('CsvReportGenerator', () => {
  const generator = new CsvReportGenerator();

  const columns: ReportColumn[] = [
    { key: 'id', label: 'ID', width: 36 },
    { key: 'name', label: 'Name', width: 25 },
    { key: 'status', label: 'Status', width: 15 },
  ];

  it('generates valid CSV with headers and data rows', async () => {
    const rows = [
      { id: '1', name: 'Alice', status: 'ACTIVE' },
      { id: '2', name: 'Bob', status: 'INACTIVE' },
    ];

    const buffer = await generator.generate(columns, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('ID,Name,Status');
    expect(lines[1]).toBe('1,Alice,ACTIVE');
    expect(lines[2]).toBe('2,Bob,INACTIVE');
  });

  it('escapes fields containing commas', async () => {
    const rows = [
      { id: '1', name: 'Doe, John', status: 'ACTIVE' },
    ];

    const buffer = await generator.generate(columns, rows);
    const csv = buffer.toString('utf-8');

    expect(csv).toContain('"Doe, John"');
  });

  it('escapes fields containing double quotes', async () => {
    const rows = [
      { id: '1', name: 'The "Boss"', status: 'ACTIVE' },
    ];

    const buffer = await generator.generate(columns, rows);
    const csv = buffer.toString('utf-8');

    expect(csv).toContain('"The ""Boss"""');
  });

  it('escapes fields containing newlines', async () => {
    const rows = [
      { id: '1', name: 'Line1\nLine2', status: 'ACTIVE' },
    ];

    const buffer = await generator.generate(columns, rows);
    const csv = buffer.toString('utf-8');

    expect(csv).toContain('"Line1\nLine2"');
  });

  it('handles null and undefined values as empty strings', async () => {
    const rows = [
      { id: '1', name: null, status: undefined },
    ];

    const buffer = await generator.generate(columns, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    expect(lines[1]).toBe('1,,');
  });

  it('handles zero rows', async () => {
    const buffer = await generator.generate(columns, []);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('ID,Name,Status');
  });

  it('returns correct content type', () => {
    expect(generator.contentType()).toBe('text/csv');
  });

  it('returns correct file extension', () => {
    expect(generator.fileExtension()).toBe('csv');
  });
});
