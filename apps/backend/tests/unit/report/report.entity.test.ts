import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import type { ReportProps } from '../../../src/modules/report/domain/report.entity';

function makeReport(overrides: Partial<ReportProps> = {}): ReportEntity {
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: { fromDate: '2026-01-01', toDate: '2026-03-01' },
    format: 'XLSX',
    status: 'PENDING',
    fileKey: null,
    requestedByUserId: 'user-1',
    startedAt: null,
    completedAt: null,
    failedAt: null,
    errorMessage: null,
    rowCount: null,
    expiresAt: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  });
}

describe('ReportEntity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('sets all properties from props', () => {
      const props: ReportProps = {
        id: 'report-42',
        tenantId: 'tenant-5',
        reportType: 'FINANCIAL_SERVICES',
        filtersJson: { branchId: 'b-1' },
        format: 'XLSX',
        status: 'READY',
        fileKey: 'reports/report-42.xlsx',
        requestedByUserId: 'user-7',
        startedAt: new Date('2026-03-10T10:00:00Z'),
        completedAt: new Date('2026-03-10T10:05:00Z'),
        failedAt: null,
        errorMessage: null,
        rowCount: 150,
        expiresAt: new Date('2026-04-09T10:05:00Z'),
        createdAt: new Date('2026-03-10T09:00:00Z'),
        updatedAt: new Date('2026-03-10T10:05:00Z'),
      };

      const report = new ReportEntity(props);

      expect(report.id).toBe('report-42');
      expect(report.tenantId).toBe('tenant-5');
      expect(report.reportType).toBe('FINANCIAL_SERVICES');
      expect(report.filtersJson).toEqual({ branchId: 'b-1' });
      expect(report.format).toBe('XLSX');
      expect(report.status).toBe('READY');
      expect(report.fileKey).toBe('reports/report-42.xlsx');
      expect(report.requestedByUserId).toBe('user-7');
      expect(report.startedAt).toEqual(new Date('2026-03-10T10:00:00Z'));
      expect(report.completedAt).toEqual(new Date('2026-03-10T10:05:00Z'));
      expect(report.failedAt).toBeNull();
      expect(report.errorMessage).toBeNull();
      expect(report.rowCount).toBe(150);
      expect(report.expiresAt).toEqual(new Date('2026-04-09T10:05:00Z'));
      expect(report.createdAt).toEqual(new Date('2026-03-10T09:00:00Z'));
      expect(report.updatedAt).toEqual(new Date('2026-03-10T10:05:00Z'));
    });

    it('allows null tenantId for platform-wide reports', () => {
      const report = makeReport({ tenantId: null });
      expect(report.tenantId).toBeNull();
    });
  });

  describe('isPending()', () => {
    it('returns true when status is PENDING', () => {
      const report = makeReport({ status: 'PENDING' });
      expect(report.isPending()).toBe(true);
    });

    it('returns false when status is not PENDING', () => {
      const report = makeReport({ status: 'PROCESSING' });
      expect(report.isPending()).toBe(false);
    });
  });

  describe('isProcessing()', () => {
    it('returns true when status is PROCESSING', () => {
      const report = makeReport({ status: 'PROCESSING' });
      expect(report.isProcessing()).toBe(true);
    });

    it('returns false when status is not PROCESSING', () => {
      const report = makeReport({ status: 'PENDING' });
      expect(report.isProcessing()).toBe(false);
    });
  });

  describe('isReady()', () => {
    it('returns true when status is READY', () => {
      const report = makeReport({ status: 'READY' });
      expect(report.isReady()).toBe(true);
    });

    it('returns false when status is not READY', () => {
      const report = makeReport({ status: 'FAILED' });
      expect(report.isReady()).toBe(false);
    });
  });

  describe('isFailed()', () => {
    it('returns true when status is FAILED', () => {
      const report = makeReport({ status: 'FAILED' });
      expect(report.isFailed()).toBe(true);
    });

    it('returns false when status is not FAILED', () => {
      const report = makeReport({ status: 'READY' });
      expect(report.isFailed()).toBe(false);
    });
  });

  describe('isExpired()', () => {
    it('returns true when expiresAt is in the past', () => {
      const report = makeReport({ expiresAt: new Date('2026-03-15T00:00:00Z') });
      expect(report.isExpired()).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const report = makeReport({ expiresAt: new Date('2026-04-20T00:00:00Z') });
      expect(report.isExpired()).toBe(false);
    });

    it('returns false when expiresAt is null', () => {
      const report = makeReport({ expiresAt: null });
      expect(report.isExpired()).toBe(false);
    });
  });

  describe('canBeDownloaded()', () => {
    it('returns true when READY, not expired, and fileKey exists', () => {
      const report = makeReport({
        status: 'READY',
        fileKey: 'reports/report-1.xlsx',
        expiresAt: new Date('2026-04-20T00:00:00Z'),
      });
      expect(report.canBeDownloaded()).toBe(true);
    });

    it('returns false when status is not READY', () => {
      const report = makeReport({
        status: 'PENDING',
        fileKey: 'reports/report-1.xlsx',
        expiresAt: new Date('2026-04-20T00:00:00Z'),
      });
      expect(report.canBeDownloaded()).toBe(false);
    });

    it('returns false when expired', () => {
      const report = makeReport({
        status: 'READY',
        fileKey: 'reports/report-1.xlsx',
        expiresAt: new Date('2026-03-10T00:00:00Z'),
      });
      expect(report.canBeDownloaded()).toBe(false);
    });

    it('returns false when fileKey is null', () => {
      const report = makeReport({
        status: 'READY',
        fileKey: null,
        expiresAt: new Date('2026-04-20T00:00:00Z'),
      });
      expect(report.canBeDownloaded()).toBe(false);
    });
  });

  describe('markProcessing()', () => {
    it('sets status to PROCESSING and updates startedAt and updatedAt', () => {
      const report = makeReport({ status: 'PENDING' });
      const beforeUpdate = report.updatedAt;

      report.markProcessing();

      expect(report.status).toBe('PROCESSING');
      expect(report.startedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
      expect(report.updatedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
      expect(report.updatedAt).not.toEqual(beforeUpdate);
    });
  });

  describe('markReady()', () => {
    it('sets status to READY with fileKey, rowCount, completedAt, expiresAt, and updatedAt', () => {
      const report = makeReport({ status: 'PROCESSING' });

      report.markReady('reports/report-1.xlsx', 250);

      expect(report.status).toBe('READY');
      expect(report.fileKey).toBe('reports/report-1.xlsx');
      expect(report.rowCount).toBe(250);
      expect(report.completedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
      expect(report.updatedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
    });

    it('sets expiresAt to 30 days after completedAt', () => {
      const report = makeReport({ status: 'PROCESSING' });

      report.markReady('reports/report-1.xlsx', 100);

      const expectedExpiry = new Date('2026-03-16T12:00:00Z');
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);

      expect(report.expiresAt).toEqual(expectedExpiry);
    });
  });

  describe('markFailed()', () => {
    it('sets status to FAILED with errorMessage, failedAt, and updatedAt', () => {
      const report = makeReport({ status: 'PROCESSING' });

      report.markFailed('Database connection timeout');

      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Database connection timeout');
      expect(report.failedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
      expect(report.updatedAt).toEqual(new Date('2026-03-16T12:00:00Z'));
    });
  });
});
