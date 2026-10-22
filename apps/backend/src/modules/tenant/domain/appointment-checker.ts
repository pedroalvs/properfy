export interface IAppointmentChecker {
  hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean>;
  hasOpenAppointmentsForBranch(tenantId: string, branchId: string): Promise<boolean>;
  hasOpenAppointmentsForProperty(tenantId: string, propertyId: string): Promise<boolean>;
}
