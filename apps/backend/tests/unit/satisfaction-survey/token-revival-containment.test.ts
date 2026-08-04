import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/confirm-appointment.use-case';
import { UpdateContactUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/update-contact.use-case';
import { SubmitSatisfactionSurveyUseCase } from '../../../src/modules/satisfaction-survey/application/use-cases/submit-satisfaction-survey.use-case';
import { PortalAppointmentInactiveError } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

/**
 * The DONE hook extends the life of a token the tenant already holds. That is
 * only safe because every other portal write blocks on the appointment *status*,
 * not on the token's expiry — so reviving the token opens the survey and nothing
 * else.
 *
 * These cases drive the real use cases against a DONE appointment rather than
 * asserting on mocks, so they would catch someone loosening a status guard.
 */
describe('token revival containment', () => {
  const DONE_APPOINTMENT = {
    appointment: {
      id: 'appointment-1',
      tenantId: 'tenant-1',
      inspectorId: 'inspector-1',
      status: 'DONE',
      rentalTenantConfirmationStatus: 'CONFIRMED',
    },
    contact: {
      id: 'contact-1',
      contactId: null,
      effectiveName: 'John Smith',
      effectiveEmail: 'john@example.com',
      effectivePhone: '+61400000000',
    },
    contacts: [],
    restrictions: [],
  };

  const appointmentRepo = {
    findById: vi.fn(),
    update: vi.fn(),
    replaceRestrictions: vi.fn(),
    updateContactSnapshot: vi.fn(),
  };
  const activityRepo = { save: vi.fn(), findLatestByTokenAndAction: vi.fn() };
  const auditService = { log: vi.fn() };
  const tokenRepo = { tryClaim: vi.fn().mockResolvedValue(true), releaseClaim: vi.fn() };
  const surveyRepo = { findByAppointmentId: vi.fn(), submit: vi.fn(), findByInspectorId: vi.fn() };

  // A revived token: no longer read-only, and already consumed by the tenant's
  // earlier confirmation.
  const revivedTokenContext = { tokenId: 'token-1', appointmentId: 'appointment-1', isReadOnly: false };

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue(DONE_APPOINTMENT);
    surveyRepo.submit.mockImplementation(async (s: unknown) => s);
  });

  it('confirming stays closed', async () => {
    const useCase = new ConfirmAppointmentUseCase(
      activityRepo as never,
      appointmentRepo as never,
      auditService as never,
      undefined,
      undefined,
      tokenRepo as never,
    );

    await expect(
      useCase.execute({
        ...revivedTokenContext,
        isPastConfirmCutoff: false,
        isUsed: false,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(PortalAppointmentInactiveError);
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('editing contact details stays closed', async () => {
    const useCase = new UpdateContactUseCase(
      activityRepo as never,
      appointmentRepo as never,
      auditService as never,
    );

    await expect(
      useCase.execute({
        ...revivedTokenContext,
        contact: { primaryEmail: 'new@example.com' },
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(PortalAppointmentInactiveError);
    expect(appointmentRepo.updateContactSnapshot).not.toHaveBeenCalled();
  });

  it('rating the inspection is the one thing that opens', async () => {
    const useCase = new SubmitSatisfactionSurveyUseCase(
      surveyRepo as never,
      appointmentRepo as never,
      activityRepo as never,
      auditService as never,
    );

    const result = await useCase.execute({
      ...revivedTokenContext,
      rating: 5,
      ipAddress: null,
      userAgent: null,
    });

    expect(result.rating).toBe(5);
    expect(surveyRepo.submit).toHaveBeenCalled();
  });

  it('the survey closes again once the extended window lapses', async () => {
    // Expiry is still the deadline — the middleware flips the token to EXPIRED
    // and marks the context read-only, and the survey shuts with it.
    const useCase = new SubmitSatisfactionSurveyUseCase(
      surveyRepo as never,
      appointmentRepo as never,
      activityRepo as never,
      auditService as never,
    );

    await expect(
      useCase.execute({
        ...revivedTokenContext,
        isReadOnly: true,
        rating: 5,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: 'PORTAL_ACTION_BLOCKED' });
  });
});
