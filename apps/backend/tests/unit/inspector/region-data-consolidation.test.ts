import { describe, it, expect } from 'vitest';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';

/**
 * GAP-002: Verify that inspector region data is consolidated.
 * The inspector_regions join table is authoritative. inspectors.regions_json is a
 * denormalized cache and MUST NOT be used for business logic (marketplace filtering,
 * assignment checks).
 */
describe('GAP-002: Inspector region data consolidation', () => {
  it('InspectorEntity does NOT expose a regionsJson field', () => {
    const inspector = new InspectorEntity({
      id: 'insp-1',
      userId: null,
      name: 'Test Inspector',
      email: 'test@example.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      serviceTypesJson: [],
      clientEligibilityJson: [],
      blockedClientsJson: [],
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

    // The entity must not have a regionsJson property — region data comes from the join table
    expect('regionsJson' in inspector).toBe(false);
  });

  it('InspectorEntity does not have any method that reads region data from JSON', () => {
    const inspector = new InspectorEntity({
      id: 'insp-1',
      userId: null,
      name: 'Test Inspector',
      email: 'test@example.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      serviceTypesJson: [{ serviceTypeId: 'svc-1', certified: false }],
      clientEligibilityJson: [{ tenantId: 'tenant-1', eligible: true }],
      blockedClientsJson: [],
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

    // The entity should only expose service type and eligibility methods, not region methods
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(inspector))
      .filter((name) => typeof (inspector as any)[name] === 'function' && name !== 'constructor');

    const regionMethods = methodNames.filter((name) =>
      name.toLowerCase().includes('region'),
    );
    expect(regionMethods).toEqual([]);
  });
});
