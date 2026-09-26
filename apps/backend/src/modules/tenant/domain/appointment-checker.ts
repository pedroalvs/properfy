export interface IAppointmentChecker {
  hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean>;
  hasOpenAppointmentsForBranch(tenantId: string, branchId: string): Promise<boolean>;
  hasOpenAppointmentsForProperty(tenantId: string, propertyId: string): Promise<boolean>;
}

/**
 * Stub implementation that always returns false.
 * Useful for tests that don't need appointment checking.
 */
export class StubAppointmentChecker implements IAppointmentChecker {
  async hasOpenAppointmentsForTenant(_tenantId: string): Promise<boolean> {
    return false;
  }

  async hasOpenAppointmentsForBranch(_tenantId: string, _branchId: string): Promise<boolean> {
    return false;
  }

  async hasOpenAppointmentsForProperty(_tenantId: string, _propertyId: string): Promise<boolean> {
    return false;
  }
}
