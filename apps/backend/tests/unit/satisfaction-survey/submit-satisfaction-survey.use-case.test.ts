import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmitSatisfactionSurveyUseCase } from '../../../src/modules/satisfaction-survey/application/use-cases/submit-satisfaction-survey.use-case';
import { SatisfactionSurveyEntity } from '../../../src/modules/satisfaction-survey/domain/satisfaction-survey.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';
import {
  PortalSurveyNoInspectorError,
  PortalSurveyNotEligibleError,
} from '../../../src/modules/satisfaction-survey/domain/satisfaction-survey.errors';

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    appointment: {
      id: 'appointment-1',
      tenantId: 'tenant-1',
      inspectorId: 'inspector-1',
      status: 'DONE',
      ...overrides,
    },
  };
}

function makeStoredSurvey(overrides: Partial<ConstructorParameters<typeof SatisfactionSurveyEntity>[0]> = {}) {
  return new SatisfactionSurveyEntity({
    id: 'survey-1',
    appointmentId: 'appointment-1',
    tenantId: 'tenant-1',
    inspectorId: 'inspector-1',
    rating: 5,
    comment: 'Very professional.',
    submittedAt: new Date('2026-08-03T10:00:00.000Z'),
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2026-08-03T10:00:00.000Z'),
    ...overrides,
  });
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: 'token-1',
    appointmentId: 'appointment-1',
    isReadOnly: false,
    rating: 5,
    comment: 'Very professional.',
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

describe('SubmitSatisfactionSurveyUseCase', () => {
  const surveyRepo = { submit: vi.fn(), findByAppointmentId: vi.fn(), findByInspectorId: vi.fn() };
  const appointmentRepo = { findById: vi.fn() };
  const activityRepo = { save: vi.fn(), findLatestByTokenAndAction: vi.fn(), findByAppointmentId: vi.fn() };
  const auditService = { log: vi.fn() };

  const useCase = new SubmitSatisfactionSurveyUseCase(
    surveyRepo as never,
    appointmentRepo as never,
    activityRepo as never,
    auditService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue(makeAppointment());
    surveyRepo.submit.mockImplementation(async (survey: SatisfactionSurveyEntity) => survey);
  });

  it('stores the response and returns it', async () => {
    const result = await useCase.execute(baseInput());

    expect(surveyRepo.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appointment-1',
        tenantId: 'tenant-1',
        inspectorId: 'inspector-1',
        rating: 5,
        comment: 'Very professional.',
      }),
    );
    expect(result).toMatchObject({ rating: 5, comment: 'Very professional.', alreadySubmitted: false });
  });

  it('normalises a blank comment to null', async () => {
    await useCase.execute(baseInput({ comment: '   ' }));

    expect(surveyRepo.submit).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
  });

  it('records a SURVEY_SUBMITTED portal activity', async () => {
    await useCase.execute(baseInput());

    expect(activityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SURVEY_SUBMITTED',
        appointmentId: 'appointment-1',
        rentalTenantPortalTokenId: 'token-1',
      }),
    );
  });

  it('keeps the comment out of the activity feed and the audit trail', async () => {
    // The activity feed is exposed through GET /v1/appointments/:id/portal-activities,
    // whose RBAC is weaker than the survey read endpoints. Writing the comment
    // there would route around the access model; the audit row is immutable and
    // outlives erasure requests, so it stays out of both.
    await useCase.execute(baseInput({ comment: 'Secret feedback about the inspector.' }));

    const [activity] = activityRepo.save.mock.calls[0];
    expect(JSON.stringify(activity.newValuesJson)).not.toContain('Secret feedback');
    expect(activity.newValuesJson).toEqual({ rating: 5 });

    const [auditEntry] = auditService.log.mock.calls[0];
    expect(JSON.stringify(auditEntry)).not.toContain('Secret feedback');
    expect(auditEntry).toMatchObject({
      action: 'rental_tenant_portal.survey_submitted',
      actorType: 'ANONYMOUS',
      tenantId: 'tenant-1',
    });
  });

  it('is idempotent: a replay returns the original response and records nothing new', async () => {
    surveyRepo.submit.mockResolvedValue(makeStoredSurvey({ rating: 3, comment: 'It was fine.' }));

    const result = await useCase.execute(baseInput({ rating: 1, comment: 'Changed my mind.' }));

    expect(result).toMatchObject({ rating: 3, comment: 'It was fine.', alreadySubmitted: true });
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('detects a replay by identity, not by timestamp', async () => {
    // A stored response that happens to carry the same submittedAt as this attempt
    // is still a replay. Discriminating on the timestamp would misreport it as a
    // fresh answer and write a duplicate activity row.
    const submit = vi.fn(async (survey: SatisfactionSurveyEntity) =>
      makeStoredSurvey({ rating: 2, comment: null, submittedAt: survey.submittedAt }),
    );
    surveyRepo.submit.mockImplementation(submit);

    const result = await useCase.execute(baseInput({ rating: 5 }));

    expect(result).toMatchObject({ rating: 2, alreadySubmitted: true });
    expect(activityRepo.save).not.toHaveBeenCalled();
  });

  it('does NOT block a token that was already used for a mutation', async () => {
    // The single easiest mistake in this module. `used_at` is set by confirm and
    // join-group, so copying the sibling use-cases' `isUsed` guard would deny the
    // survey to every tenant who confirmed attendance — i.e. the happy path.
    const result = await useCase.execute(baseInput({ isUsed: true }));

    expect(result).toMatchObject({ rating: 5 });
    expect(surveyRepo.submit).toHaveBeenCalled();
  });

  it('blocks a read-only (expired) token', async () => {
    // This is what closes the 14-day window: once the extended expiry passes the
    // middleware marks the token read-only and the survey shuts on its own.
    await expect(useCase.execute(baseInput({ isReadOnly: true }))).rejects.toBeInstanceOf(
      PortalActionBlockedError,
    );
    expect(surveyRepo.submit).not.toHaveBeenCalled();
  });

  it('rejects an appointment that was never executed', async () => {
    appointmentRepo.findById.mockResolvedValue(makeAppointment({ status: 'SCHEDULED' }));

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(PortalSurveyNotEligibleError);
    expect(surveyRepo.submit).not.toHaveBeenCalled();
  });

  it('rejects a DONE appointment with no inspector to rate', async () => {
    appointmentRepo.findById.mockResolvedValue(makeAppointment({ inspectorId: null }));

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(PortalSurveyNoInspectorError);
  });

  it('rejects a vanished appointment', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(PortalAppointmentInactiveError);
  });

  it('rejects a rating outside the 1..5 scale', async () => {
    // Defence in depth behind the Zod route schema and the database CHECK.
    await expect(useCase.execute(baseInput({ rating: 6 }))).rejects.toBeInstanceOf(
      PortalSurveyNotEligibleError,
    );
    await expect(useCase.execute(baseInput({ rating: 0 }))).rejects.toBeInstanceOf(
      PortalSurveyNotEligibleError,
    );
    expect(surveyRepo.submit).not.toHaveBeenCalled();
  });
});
