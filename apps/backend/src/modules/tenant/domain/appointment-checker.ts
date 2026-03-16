export interface IAppointmentChecker {
  hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean>;
  hasOpenAppointmentsForBranch(branchId: string): Promise<boolean>;
}

/**
 * Stub implementation that always returns false.
 * Replace when the appointment module is built.
 */
export class StubAppointmentChecker implements IAppointmentChecker {
  async hasOpenAppointmentsForTenant(_tenantId: string): Promise<boolean> {
    return false;
  }

  async hasOpenAppointmentsForBranch(_branchId: string): Promise<boolean> {
    return false;
  }
}
