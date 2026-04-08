import { describe, it, expect } from 'vitest';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';

function makeEntity(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * 1',
    deliveryEmail: 'test@example.com',
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(now.getTime() + 86400000),
    createdByUserId: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ScheduledReportEntity', () => {
  describe('isDue', () => {
    it('should return true when active and nextRunAt is in the past', () => {
      const past = new Date(Date.now() - 60000);
      const entity = makeEntity({ nextRunAt: past });

      expect(entity.isDue(new Date())).toBe(true);
    });

    it('should return false when nextRunAt is in the future', () => {
      const future = new Date(Date.now() + 86400000);
      const entity = makeEntity({ nextRunAt: future });

      expect(entity.isDue(new Date())).toBe(false);
    });

    it('should return false when inactive', () => {
      const past = new Date(Date.now() - 60000);
      const entity = makeEntity({ isActive: false, nextRunAt: past });

      expect(entity.isDue(new Date())).toBe(false);
    });

    it('should return false when nextRunAt is null', () => {
      const entity = makeEntity({ nextRunAt: null });

      expect(entity.isDue(new Date())).toBe(false);
    });
  });

  describe('markRun', () => {
    it('should update lastRunAt and nextRunAt', () => {
      const entity = makeEntity();
      const now = new Date();
      const nextRun = new Date(now.getTime() + 604800000);

      entity.markRun(now, nextRun);

      expect(entity.lastRunAt).toBe(now);
      expect(entity.nextRunAt).toBe(nextRun);
      expect(entity.updatedAt).toBe(now);
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', () => {
      const entity = makeEntity({ isActive: true });

      entity.deactivate();

      expect(entity.isActive).toBe(false);
    });
  });
});
