import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import type { IInspectorAppointmentVisibility } from '../../../src/modules/property-file/domain/inspector-appointment-visibility';
import { makeActor, TENANT_A, TENANT_B, PROPERTY_A, APPT_A } from './_helpers';

function build(visible: { propertyId: string; tenantId: string } | null = { propertyId: PROPERTY_A, tenantId: TENANT_A }) {
  const visibility = {
    resolveForInspector: vi.fn(async () => visible),
  } as unknown as IInspectorAppointmentVisibility;
  return { scope: new PropertyScopeService(visibility), visibility };
}

const fileInA = { tenantId: TENANT_A, appointmentId: APPT_A };

describe('PropertyScopeService.assertCanReadFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AM/OP read cross-tenant', async () => {
    const { scope } = build();
    await expect(scope.assertCanReadFile(makeActor('AM'), fileInA)).resolves.toBeUndefined();
    await expect(scope.assertCanReadFile(makeActor('OP'), fileInA)).resolves.toBeUndefined();
  });

  it('CL_ADMIN reads own tenant, 404 on another tenant (C.A2)', async () => {
    const { scope } = build();
    await expect(scope.assertCanReadFile(makeActor('CL_ADMIN'), fileInA)).resolves.toBeUndefined();
    await expect(
      scope.assertCanReadFile(makeActor('CL_ADMIN'), { tenantId: TENANT_B, appointmentId: APPT_A }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('INSP reads a visible appointment file; 404 when not visible', async () => {
    const ok = build({ propertyId: PROPERTY_A, tenantId: TENANT_A });
    await expect(ok.scope.assertCanReadFile(makeActor('INSP'), fileInA)).resolves.toBeUndefined();
    const no = build(null);
    await expect(no.scope.assertCanReadFile(makeActor('INSP'), fileInA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('INSP 404s a file with no appointment', async () => {
    const { scope } = build();
    await expect(
      scope.assertCanReadFile(makeActor('INSP'), { tenantId: TENANT_A, appointmentId: null }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('PropertyScopeService.resolveReadListScope', () => {
  it('AM/OP → no tenant predicate; CL → pinned tenant', async () => {
    const { scope } = build();
    expect(await scope.resolveReadListScope(makeActor('AM'), { propertyId: PROPERTY_A })).toEqual({});
    expect(await scope.resolveReadListScope(makeActor('CL_ADMIN'), { propertyId: PROPERTY_A })).toEqual({ tenantId: TENANT_A });
  });

  it('INSP must query by a visible appointment', async () => {
    const ok = build({ propertyId: PROPERTY_A, tenantId: TENANT_A });
    expect(await ok.scope.resolveReadListScope(makeActor('INSP'), { appointmentId: APPT_A })).toEqual({ tenantId: TENANT_A });
    // property-only → forbidden
    await expect(ok.scope.resolveReadListScope(makeActor('INSP'), { propertyId: PROPERTY_A })).rejects.toThrow();
    // not visible → 404
    const no = build(null);
    await expect(no.scope.resolveReadListScope(makeActor('INSP'), { appointmentId: APPT_A })).rejects.toMatchObject({ statusCode: 404 });
  });

  // C.A2: a tenant-pinned actor listing another agency's (or a missing) target
  // gets 404, matching the detail route — not a silent empty list.
  it('CL 404s a target owned by another tenant', async () => {
    const { scope } = build();
    await expect(
      scope.resolveReadListScope(makeActor('CL_ADMIN'), { propertyId: PROPERTY_A }, async () => TENANT_B),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      scope.resolveReadListScope(makeActor('CL_USER'), { appointmentId: APPT_A }, async () => TENANT_B),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('CL 404s a missing target', async () => {
    const { scope } = build();
    await expect(
      scope.resolveReadListScope(makeActor('CL_ADMIN'), { propertyId: PROPERTY_A }, async () => null),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('CL passes for a target in its own tenant', async () => {
    const { scope } = build();
    expect(
      await scope.resolveReadListScope(makeActor('CL_ADMIN'), { propertyId: PROPERTY_A }, async () => TENANT_A),
    ).toEqual({ tenantId: TENANT_A });
  });

  it('AM/OP never consult the resolver and stay cross-tenant', async () => {
    const { scope } = build();
    const resolver = vi.fn(async () => TENANT_B);
    expect(await scope.resolveReadListScope(makeActor('AM'), { propertyId: PROPERTY_A }, resolver)).toEqual({});
    expect(await scope.resolveReadListScope(makeActor('OP'), { propertyId: PROPERTY_A }, resolver)).toEqual({});
    expect(resolver).not.toHaveBeenCalled();
  });
});
