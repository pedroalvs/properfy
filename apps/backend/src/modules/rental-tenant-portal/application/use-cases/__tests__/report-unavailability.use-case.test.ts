import { describe, it, expect, vi } from 'vitest';
import { ReportUnavailabilityUseCase } from '../report-unavailability.use-case';

function makeUseCase() {
  const appointment = {
    id: 'appt-1',
    tenantId: 'tenant-1',
    status: 'SCHEDULED',
    rentalTenantConfirmationStatus: 'PENDING',
  };
  const activityRepo = { save: vi.fn() };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({ appointment, contact: null, contacts: [], restrictions: [] }),
    update: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    saveRestriction: vi.fn(),
  };
  const auditService = { log: vi.fn() };
  const uc = new ReportUnavailabilityUseCase(activityRepo as any, appointmentRepo as any, auditService as any);
  return { uc, auditService };
}

const BASE_INPUT = {
  tokenId: 'token-1',
  appointmentId: 'appt-1',
  isReadOnly: false,
  isUsed: false,
  isPastConfirmCutoff: false,
  ipAddress: null,
  userAgent: null,
};

describe('ReportUnavailabilityUseCase — urgentMode derives from the confirm cutoff', () => {
  it('reports urgentMode=true past the confirm cutoff (token still valid)', async () => {
    const { uc, auditService } = makeUseCase();

    const result = await uc.execute({ ...BASE_INPUT, isPastConfirmCutoff: true });

    expect(result.urgentMode).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ urgentMode: true }) }),
    );
  });

  it('reports urgentMode=false before the cutoff', async () => {
    const { uc } = makeUseCase();

    const result = await uc.execute(BASE_INPUT);

    expect(result.urgentMode).toBe(false);
  });
});
