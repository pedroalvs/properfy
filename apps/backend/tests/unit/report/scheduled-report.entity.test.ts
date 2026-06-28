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
    displayName: null,
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
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

    it('should return false when paused', () => {
      const past = new Date(Date.now() - 60000);
      const entity = makeEntity({ status: 'PAUSED', nextRunAt: past });

      expect(entity.isDue(new Date())).toBe(false);
    });

    it('should return false when soft-deleted', () => {
      const past = new Date(Date.now() - 60000);
      const entity = makeEntity({ deletedAt: new Date(), nextRunAt: past });

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
    it('should pause the schedule', () => {
      const entity = makeEntity({ status: 'ACTIVE' });

      entity.deactivate();

      expect(entity.status).toBe('PAUSED');
    });
  });

  // ─── Feature 019: lifecycle state machine ────────────────────────────────

  describe('feature 019: pause / resume', () => {
    it('pause() transitions to PAUSED', () => {
      const entity = makeEntity({ status: 'ACTIVE' });
      entity.pause();
      expect(entity.status).toBe('PAUSED');
    });

    it('pause() is idempotent', () => {
      const entity = makeEntity({ status: 'PAUSED' });
      entity.pause();
      expect(entity.status).toBe('PAUSED');
    });

    it('resume() transitions to ACTIVE and resets the failure counter', () => {
      const entity = makeEntity({
        status: 'PAUSED',
        consecutiveFailureCount: 3,
      });
      const nextRun = new Date(Date.now() + 86400000);

      entity.resume(nextRun);

      expect(entity.status).toBe('ACTIVE');
      expect(entity.consecutiveFailureCount).toBe(0);
      expect(entity.nextRunAt).toBe(nextRun);
    });
  });

  describe('feature 019: softDelete', () => {
    it('softDelete() sets deletedAt and pauses the schedule', () => {
      const entity = makeEntity({ status: 'ACTIVE' });
      entity.softDelete();
      expect(entity.deletedAt).toBeInstanceOf(Date);
      expect(entity.status).toBe('PAUSED');
    });

    it('isDue() returns false after soft-delete', () => {
      const past = new Date(Date.now() - 60000);
      const entity = makeEntity({ nextRunAt: past });
      entity.softDelete();
      expect(entity.isDue(new Date())).toBe(false);
    });
  });

  describe('feature 019: recordSuccess', () => {
    it('resets the failure counter and advances timestamps', () => {
      const entity = makeEntity({ consecutiveFailureCount: 2 });
      const now = new Date();
      const nextRun = new Date(now.getTime() + 86400000);

      entity.recordSuccess(now, nextRun);

      expect(entity.consecutiveFailureCount).toBe(0);
      expect(entity.lastRunAt).toBe(now);
      expect(entity.nextRunAt).toBe(nextRun);
    });
  });

  describe('feature 019: recordFailure / auto-pause', () => {
    it('increments the counter and returns autoPaused=false for counts 1 and 2', () => {
      const entity = makeEntity({ consecutiveFailureCount: 0 });

      const r1 = entity.recordFailure(new Date());
      expect(r1.autoPaused).toBe(false);
      expect(entity.consecutiveFailureCount).toBe(1);
      expect(entity.status).toBe('ACTIVE');

      const r2 = entity.recordFailure(new Date());
      expect(r2.autoPaused).toBe(false);
      expect(entity.consecutiveFailureCount).toBe(2);
      expect(entity.status).toBe('ACTIVE');
    });

    it('auto-pauses at the 3rd consecutive failure', () => {
      const entity = makeEntity({ consecutiveFailureCount: 2 });

      const r = entity.recordFailure(new Date());

      expect(r.autoPaused).toBe(true);
      expect(entity.consecutiveFailureCount).toBe(3);
      expect(entity.status).toBe('PAUSED');
    });
  });
});
