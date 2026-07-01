import { describe, it, expect } from 'vitest';
import {
  AssetKind,
  RentalTenantPortalTokenStatus,
  RentalTenantPortalAction,
  ReportType,
  ReportStatus,
  ReportDateAxis,
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

describe('RentalTenantPortalTokenStatus', () => {
  it('should have ACTIVE, EXPIRED, REVOKED, SUPERSEDED values', () => {
    expect(RentalTenantPortalTokenStatus.ACTIVE).toBe('ACTIVE');
    expect(RentalTenantPortalTokenStatus.EXPIRED).toBe('EXPIRED');
    expect(RentalTenantPortalTokenStatus.REVOKED).toBe('REVOKED');
    expect(RentalTenantPortalTokenStatus.SUPERSEDED).toBe('SUPERSEDED');
  });

  it('should have exactly 4 statuses', () => {
    expect(Object.keys(RentalTenantPortalTokenStatus)).toHaveLength(4);
  });

  it('should not have USED status', () => {
    expect(Object.values(RentalTenantPortalTokenStatus)).not.toContain('USED');
  });
});

describe('RentalTenantPortalAction', () => {
  it('should have VIEW, CONFIRM, RESCHEDULE, CONTACT_UPDATED, UNAVAILABLE_REPORTED, GROUP_JOIN values', () => {
    expect(RentalTenantPortalAction.VIEW).toBe('VIEW');
    expect(RentalTenantPortalAction.CONFIRM).toBe('CONFIRM');
    expect(RentalTenantPortalAction.RESCHEDULE).toBe('RESCHEDULE');
    expect(RentalTenantPortalAction.CONTACT_UPDATED).toBe('CONTACT_UPDATED');
    expect(RentalTenantPortalAction.UNAVAILABLE_REPORTED).toBe('UNAVAILABLE_REPORTED');
    expect(RentalTenantPortalAction.GROUP_JOIN).toBe('GROUP_JOIN');
  });

  it('should have exactly 6 actions', () => {
    expect(Object.keys(RentalTenantPortalAction)).toHaveLength(6);
  });
});

describe('ReportType', () => {
  it('should have the 4 scoped report type values', () => {
    expect(ReportType.APPOINTMENTS).toBe('APPOINTMENTS');
    expect(ReportType.FINANCIAL).toBe('FINANCIAL');
    expect(ReportType.PERFORMANCE).toBe('PERFORMANCE');
    expect(ReportType.AGENCIES).toBe('AGENCIES');
  });

  it('should have exactly 4 types', () => {
    expect(Object.keys(ReportType)).toHaveLength(4);
  });

  it('should not carry the removed legacy split/confirmation types', () => {
    const values = Object.values(ReportType) as string[];
    for (const legacy of [
      'INSPECTIONS_SCHEDULED',
      'INSPECTIONS_DONE',
      'INSPECTIONS_CANCELLED',
      'INSPECTIONS_REJECTED',
      'INSPECTOR_PERFORMANCE',
      'CONFIRMATION_STATUS',
      'FINANCIAL_SERVICES',
    ]) {
      expect(values).not.toContain(legacy);
    }
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

describe('ReportDateAxis', () => {
  it('should have SCHEDULED, CREATED, COMPLETED values', () => {
    expect(ReportDateAxis.SCHEDULED).toBe('SCHEDULED');
    expect(ReportDateAxis.CREATED).toBe('CREATED');
    expect(ReportDateAxis.COMPLETED).toBe('COMPLETED');
  });

  it('should have exactly 3 axes', () => {
    expect(Object.keys(ReportDateAxis)).toHaveLength(3);
  });
});
