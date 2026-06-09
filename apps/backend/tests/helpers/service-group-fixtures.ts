/**
 * Test helper: derive the tenant-related fields of a `ServiceGroupWithAppointments`
 * fixture from its appointments, mirroring the production repository derivation
 * (groups are tenant-agnostic; tenant lives on each appointment).
 */
export function deriveTenantFixture(appointments: Array<{ tenantId: string }>): {
  tenantIds: string[];
  primaryTenantId: string | null;
  agencies: Array<{ id: string; name: string }>;
} {
  const tenantIds = [...new Set(appointments.map((a) => a.tenantId))];
  return {
    tenantIds,
    primaryTenantId: tenantIds.length === 1 ? tenantIds[0]! : null,
    agencies: tenantIds.map((id) => ({ id, name: `Agency ${id}` })),
  };
}
