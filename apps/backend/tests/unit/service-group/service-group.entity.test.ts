import { describe, it, expect } from 'vitest';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import type { ServiceGroupProps } from '../../../src/modules/service-group/domain/service-group.entity';

function makeServiceGroup(overrides: Partial<ServiceGroupProps> = {}): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'sg-1',
    serviceTypeId: 'st-1',
    status: 'DRAFT',
    groupSize: 10,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-04-01'),
    timeWindow: '08:00-12:00',
    assignedInspectorId: null,
    publishedAt: null,
    assignedAt: null,
    regionName: null,
    description: null,
    serviceRegionId: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });
}

describe('ServiceGroupEntity', () => {
  describe('construction', () => {
    it('creates entity with all props', () => {
      const now = new Date();
      const group = makeServiceGroup({
        id: 'sg-99',
        serviceTypeId: 'st-99',
        status: 'PUBLISHED',
        groupSize: 15,
        offeredCount: 3,
        confirmedCount: 1,
        scheduledDate: new Date('2026-05-01'),
        timeWindow: '14:00-18:00',
        assignedInspectorId: 'insp-1',
        publishedAt: now,
        assignedAt: now,
        createdByUserId: 'user-99',
        createdAt: new Date('2026-03-10'),
        updatedAt: new Date('2026-03-11'),
      });

      expect(group.id).toBe('sg-99');
      expect(group.serviceTypeId).toBe('st-99');
      expect(group.status).toBe('PUBLISHED');
      expect(group.groupSize).toBe(15);
      expect(group.offeredCount).toBe(3);
      expect(group.confirmedCount).toBe(1);
      expect(group.scheduledDate).toEqual(new Date('2026-05-01'));
      expect(group.timeWindow).toBe('14:00-18:00');
      expect(group.assignedInspectorId).toBe('insp-1');
      expect(group.publishedAt).toBe(now);
      expect(group.assignedAt).toBe(now);
      expect(group.createdByUserId).toBe('user-99');
      expect(group.createdAt).toEqual(new Date('2026-03-10'));
      expect(group.updatedAt).toEqual(new Date('2026-03-11'));
    });
  });

  describe('canPublish()', () => {
    it('returns true for DRAFT status', () => {
      expect(makeServiceGroup({ status: 'DRAFT' }).canPublish()).toBe(true);
    });

    it('returns false for PUBLISHED status', () => {
      expect(makeServiceGroup({ status: 'PUBLISHED' }).canPublish()).toBe(false);
    });

    it('returns false for ACCEPTED status', () => {
      expect(makeServiceGroup({ status: 'ACCEPTED' }).canPublish()).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(makeServiceGroup({ status: 'CANCELLED' }).canPublish()).toBe(false);
    });
  });

  describe('canAssign()', () => {
    it('returns true for DRAFT status', () => {
      expect(makeServiceGroup({ status: 'DRAFT' }).canAssign()).toBe(true);
    });

    it('returns true for PUBLISHED status', () => {
      expect(makeServiceGroup({ status: 'PUBLISHED' }).canAssign()).toBe(true);
    });

    it('returns false for ACCEPTED status', () => {
      expect(makeServiceGroup({ status: 'ACCEPTED' }).canAssign()).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(makeServiceGroup({ status: 'CANCELLED' }).canAssign()).toBe(false);
    });
  });

  describe('canAccept()', () => {
    it('returns true for PUBLISHED status', () => {
      expect(makeServiceGroup({ status: 'PUBLISHED' }).canAccept()).toBe(true);
    });

    it('returns false for DRAFT status', () => {
      expect(makeServiceGroup({ status: 'DRAFT' }).canAccept()).toBe(false);
    });

    it('returns false for ACCEPTED status', () => {
      expect(makeServiceGroup({ status: 'ACCEPTED' }).canAccept()).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(makeServiceGroup({ status: 'CANCELLED' }).canAccept()).toBe(false);
    });
  });

  describe('canCancel()', () => {
    it('returns true for DRAFT status', () => {
      expect(makeServiceGroup({ status: 'DRAFT' }).canCancel()).toBe(true);
    });

    it('returns true for PUBLISHED status', () => {
      expect(makeServiceGroup({ status: 'PUBLISHED' }).canCancel()).toBe(true);
    });

    it('returns true for ACCEPTED status', () => {
      expect(makeServiceGroup({ status: 'ACCEPTED' }).canCancel()).toBe(true);
    });

    it('returns false for CANCELLED status', () => {
      expect(makeServiceGroup({ status: 'CANCELLED' }).canCancel()).toBe(false);
    });
  });

  describe('canReject()', () => {
    it('returns true for PUBLISHED status', () => {
      expect(makeServiceGroup({ status: 'PUBLISHED' }).canReject()).toBe(true);
    });

    it('returns true for ACCEPTED status', () => {
      expect(makeServiceGroup({ status: 'ACCEPTED' }).canReject()).toBe(true);
    });

    it('returns false for DRAFT status', () => {
      expect(makeServiceGroup({ status: 'DRAFT' }).canReject()).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(makeServiceGroup({ status: 'CANCELLED' }).canReject()).toBe(false);
    });
  });

});
