export interface IAppointmentChecker {
  hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean>;
  hasOpenAppointmentsForBranch(branchId: string): Promise<boolean>;
  hasOpenAppointmentsForProperty(propertyId: string): Promise<boolean>;
}

/**
 * Stub implementation that always returns false.
 * Useful for tests that don't need appointment checking.
 */
export class StubAppointmentChecker implements IAppointmentChecker {
  async hasOpenAppointmentsForTenant(_tenantId: string): Promise<boolean> {
    return false;
  }

  async hasOpenAppointmentsForBranch(_branchId: string): Promise<boolean> {
    return false;
  }

  async hasOpenAppointmentsForProperty(_propertyId: string): Promise<boolean> {
    return false;
  }
}
