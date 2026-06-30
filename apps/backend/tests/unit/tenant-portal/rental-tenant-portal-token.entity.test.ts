import { describe, it, expect } from 'vitest';
import {
  RentalTenantPortalTokenEntity,
  type RentalTenantPortalTokenProps,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';

function makeTokenProps(overrides: Partial<RentalTenantPortalTokenProps> = {}): RentalTenantPortalTokenProps {
  return {
    id: 'token-1',
    appointmentId: 'appt-1',
    tokenHash: 'abc123hash',
    expiresAt: new Date('2026-04-10T08:00:00Z'),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

describe('RentalTenantPortalTokenEntity', () => {
  describe('isExpired', () => {
    it('should return true when now is after expiresAt', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps());
      const now = new Date('2026-04-10T09:00:00Z');

      expect(token.isExpired(now)).toBe(true);
    });

    it('should return false when now is before expiresAt', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps());
      const now = new Date('2026-04-10T07:00:00Z');

      expect(token.isExpired(now)).toBe(false);
    });

    it('should return false when now equals expiresAt', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps());
      const now = new Date('2026-04-10T08:00:00Z');

      expect(token.isExpired(now)).toBe(false);
    });
  });

  describe('isRevoked', () => {
    it('should return true for REVOKED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'REVOKED' }));

      expect(token.isRevoked()).toBe(true);
    });

    it('should return false for ACTIVE status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'ACTIVE' }));

      expect(token.isRevoked()).toBe(false);
    });

    it('should return false for EXPIRED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'EXPIRED' }));

      expect(token.isRevoked()).toBe(false);
    });
  });

  describe('isActive', () => {
    it('should return true for ACTIVE status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'ACTIVE' }));

      expect(token.isActive()).toBe(true);
    });

    it('should return false for REVOKED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'REVOKED' }));

      expect(token.isActive()).toBe(false);
    });

    it('should return false for EXPIRED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'EXPIRED' }));

      expect(token.isActive()).toBe(false);
    });
  });

  describe('isReadOnly', () => {
    it('should return true for EXPIRED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'EXPIRED' }));
      const now = new Date('2026-04-05T00:00:00Z');

      expect(token.isReadOnly(now)).toBe(true);
    });

    it('should return true for ACTIVE status when past expiry', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'ACTIVE' }));
      const now = new Date('2026-04-11T00:00:00Z');

      expect(token.isReadOnly(now)).toBe(true);
    });

    it('should return false for ACTIVE status within expiry', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'ACTIVE' }));
      const now = new Date('2026-04-09T00:00:00Z');

      expect(token.isReadOnly(now)).toBe(false);
    });

    it('should return false for REVOKED status', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'REVOKED' }));
      const now = new Date('2026-04-05T00:00:00Z');

      expect(token.isReadOnly(now)).toBe(false);
    });
  });

  describe('isUsed', () => {
    it('should return false when usedAt is null', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ usedAt: null }));

      expect(token.isUsed()).toBe(false);
    });

    it('should return true when usedAt is set', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ usedAt: new Date() }));

      expect(token.isUsed()).toBe(true);
    });
  });

  describe('markUsed', () => {
    it('should set usedAt to a date', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ usedAt: null }));

      token.markUsed();

      expect(token.usedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt', () => {
      const originalUpdatedAt = new Date('2020-01-01T00:00:00Z');
      const token = new RentalTenantPortalTokenEntity(
        makeTokenProps({ usedAt: null, updatedAt: originalUpdatedAt }),
      );

      token.markUsed();

      expect(token.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('markExpired', () => {
    it('should change status to EXPIRED', () => {
      const token = new RentalTenantPortalTokenEntity(makeTokenProps({ status: 'ACTIVE' }));

      token.markExpired();

      expect(token.status).toBe('EXPIRED');
    });

    it('should update updatedAt', () => {
      const originalUpdatedAt = new Date('2020-01-01T00:00:00Z');
      const token = new RentalTenantPortalTokenEntity(
        makeTokenProps({ status: 'ACTIVE', updatedAt: originalUpdatedAt }),
      );

      token.markExpired();

      expect(token.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      expect(token.updatedAt.getTime()).not.toBe(originalUpdatedAt.getTime());
    });
  });

  describe('constructor', () => {
    it('should set all properties correctly', () => {
      const props = makeTokenProps({
        lastAccessedAt: new Date('2026-04-05T12:00:00Z'),
      });
      const token = new RentalTenantPortalTokenEntity(props);

      expect(token.id).toBe(props.id);
      expect(token.appointmentId).toBe(props.appointmentId);
      expect(token.tokenHash).toBe(props.tokenHash);
      expect(token.expiresAt).toBe(props.expiresAt);
      expect(token.status).toBe(props.status);
      expect(token.lastAccessedAt).toBe(props.lastAccessedAt);
      expect(token.createdAt).toBe(props.createdAt);
      expect(token.updatedAt).toBe(props.updatedAt);
    });
  });
});
