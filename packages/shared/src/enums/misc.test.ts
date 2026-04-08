import { describe, it, expect } from 'vitest';
import {
  AssetKind,
  TenantPortalTokenStatus,
  TenantPortalAction,
  ReportType,
  ReportStatus,
  ReportFormat,
} from './misc';

describe('AssetKind', () => {
  it('should have PHOTO, VIDEO, DOCUMENT values', () => {
    expect(AssetKind.PHOTO).toBe('PHOTO');
    expect(AssetKind.VIDEO).toBe('VIDEO');
    expect(AssetKind.DOCUMENT).toBe('DOCUMENT');
  });

  it('should have exactly 3 kinds', () => {
    expect(Object.keys(AssetKind)).toHaveLength(3);
  });
});

describe('TenantPortalTokenStatus', () => {
  it('should have ACTIVE, EXPIRED, REVOKED values', () => {
    expect(TenantPortalTokenStatus.ACTIVE).toBe('ACTIVE');
    expect(TenantPortalTokenStatus.EXPIRED).toBe('EXPIRED');
    expect(TenantPortalTokenStatus.REVOKED).toBe('REVOKED');
  });

  it('should have exactly 3 statuses', () => {
    expect(Object.keys(TenantPortalTokenStatus)).toHaveLength(3);
  });

  it('should not have USED status', () => {
    expect(Object.values(TenantPortalTokenStatus)).not.toContain('USED');
  });
});

describe('TenantPortalAction', () => {
  it('should have VIEW, CONFIRM, RESCHEDULE, CONTACT_UPDATED, UNAVAILABLE_REPORTED values', () => {
    expect(TenantPortalAction.VIEW).toBe('VIEW');
    expect(TenantPortalAction.CONFIRM).toBe('CONFIRM');
    expect(TenantPortalAction.RESCHEDULE).toBe('RESCHEDULE');
    expect(TenantPortalAction.CONTACT_UPDATED).toBe('CONTACT_UPDATED');
    expect(TenantPortalAction.UNAVAILABLE_REPORTED).toBe('UNAVAILABLE_REPORTED');
  });

  it('should have exactly 5 actions', () => {
    expect(Object.keys(TenantPortalAction)).toHaveLength(5);
  });
});

describe('ReportType', () => {
  it('should have all 7 report type values', () => {
    expect(ReportType.INSPECTIONS_SCHEDULED).toBe('INSPECTIONS_SCHEDULED');
    expect(ReportType.INSPECTIONS_DONE).toBe('INSPECTIONS_DONE');
    expect(ReportType.INSPECTIONS_CANCELLED).toBe('INSPECTIONS_CANCELLED');
    expect(ReportType.INSPECTIONS_REJECTED).toBe('INSPECTIONS_REJECTED');
    expect(ReportType.INSPECTOR_PERFORMANCE).toBe('INSPECTOR_PERFORMANCE');
    expect(ReportType.CONFIRMATION_STATUS).toBe('CONFIRMATION_STATUS');
    expect(ReportType.FINANCIAL_SERVICES).toBe('FINANCIAL_SERVICES');
  });

  it('should have exactly 7 types', () => {
    expect(Object.keys(ReportType)).toHaveLength(7);
  });
});

describe('ReportStatus', () => {
  it('should have PENDING, PROCESSING, READY, FAILED values', () => {
    expect(ReportStatus.PENDING).toBe('PENDING');
    expect(ReportStatus.PROCESSING).toBe('PROCESSING');
    expect(ReportStatus.READY).toBe('READY');
    expect(ReportStatus.FAILED).toBe('FAILED');
  });

  it('should have exactly 4 statuses', () => {
    expect(Object.keys(ReportStatus)).toHaveLength(4);
  });
});

describe('ReportFormat', () => {
  it('should have XLSX, CSV, PDF values', () => {
    expect(ReportFormat.XLSX).toBe('XLSX');
    expect(ReportFormat.CSV).toBe('CSV');
    expect(ReportFormat.PDF).toBe('PDF');
  });

  it('should have exactly 3 formats', () => {
    expect(Object.keys(ReportFormat)).toHaveLength(3);
  });
});
