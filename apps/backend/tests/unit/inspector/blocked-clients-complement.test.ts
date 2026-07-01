import { describe, it, expect } from 'vitest';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';

function makeInspector(blockedClients: string[]) {
  return new InspectorEntity({
    id: 'insp-1',
    userId: null,
    name: 'Test',
    email: 'test@test.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    blockedClientsJson: blockedClients,
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('blocked-clients complement logic', () => {
  it('empty blockedClients = eligible for all tenants', () => {
    const inspector = makeInspector([]);
    expect(inspector.isEligibleForTenant('tenant-A')).toBe(true);
    expect(inspector.isEligibleForTenant('tenant-B')).toBe(true);
    expect(inspector.isBlockedForTenant('tenant-A')).toBe(false);
  });

  it('blocked from tenant-C and tenant-D = eligible for A and B', () => {
    const inspector = makeInspector(['tenant-C', 'tenant-D']);
    expect(inspector.isEligibleForTenant('tenant-A')).toBe(true);
    expect(inspector.isEligibleForTenant('tenant-B')).toBe(true);
    expect(inspector.isEligibleForTenant('tenant-C')).toBe(false);
    expect(inspector.isEligibleForTenant('tenant-D')).toBe(false);
    expect(inspector.isBlockedForTenant('tenant-C')).toBe(true);
  });

  it('blocked from all known tenants = not eligible for any', () => {
    const inspector = makeInspector(['tenant-A', 'tenant-B', 'tenant-C', 'tenant-D']);
    expect(inspector.isEligibleForTenant('tenant-A')).toBe(false);
    expect(inspector.isEligibleForTenant('tenant-B')).toBe(false);
    expect(inspector.isEligibleForTenant('tenant-C')).toBe(false);
    expect(inspector.isEligibleForTenant('tenant-D')).toBe(false);
  });

  it('isBlockedForTenant and isEligibleForTenant are inverse', () => {
    const inspector = makeInspector(['tenant-X']);
    expect(inspector.isBlockedForTenant('tenant-X')).toBe(true);
    expect(inspector.isEligibleForTenant('tenant-X')).toBe(false);
    expect(inspector.isBlockedForTenant('tenant-Y')).toBe(false);
    expect(inspector.isEligibleForTenant('tenant-Y')).toBe(true);
  });
});
