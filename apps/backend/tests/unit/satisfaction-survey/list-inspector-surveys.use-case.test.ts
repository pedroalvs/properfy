import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListInspectorSurveysUseCase } from '../../../src/modules/satisfaction-survey/application/use-cases/list-inspector-surveys.use-case';
import { SatisfactionSurveyEntity } from '../../../src/modules/satisfaction-survey/domain/satisfaction-survey.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeSurvey(overrides: Partial<ConstructorParameters<typeof SatisfactionSurveyEntity>[0]> = {}) {
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

function actor(role: string, overrides: Record<string, unknown> = {}) {
  return { userId: 'user-1', role, tenantId: null, branchId: null, inspectorId: null, ...overrides } as never;
}

describe('ListInspectorSurveysUseCase', () => {
  const surveyRepo = { findByInspectorId: vi.fn(), findByAppointmentId: vi.fn(), submit: vi.fn() };
  const useCase = new ListInspectorSurveysUseCase(surveyRepo as never);

  function input(role: string, actorOverrides: Record<string, unknown> = {}) {
    return {
      inspectorId: 'inspector-1',
      pagination: { page: 1, pageSize: 10 },
      actor: actor(role, actorOverrides),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    surveyRepo.findByInspectorId.mockResolvedValue({
      surveys: [{ survey: makeSurvey(), appointmentCode: 'INS-0042' }],
      total: 1,
    });
  });

  it('lets AM read every response unscoped', async () => {
    const result = await useCase.execute(input('AM'));

    expect(surveyRepo.findByInspectorId).toHaveBeenCalledWith('inspector-1', null, 1, 10);
    expect(result.data[0]).toMatchObject({ rating: 5, comment: 'Very professional.' });
  });

  it('lets OP read every response unscoped', async () => {
    await useCase.execute(input('OP'));

    expect(surveyRepo.findByInspectorId).toHaveBeenCalledWith('inspector-1', null, 1, 10);
  });

  it('pins an agency admin to its own tenant', async () => {
    await useCase.execute(input('CL_ADMIN', { tenantId: 'tenant-1' }));

    expect(surveyRepo.findByInspectorId).toHaveBeenCalledWith('inspector-1', 'tenant-1', 1, 10);
  });

  it('pins an agency user to its own tenant', async () => {
    await useCase.execute(input('CL_USER', { tenantId: 'tenant-1' }));

    expect(surveyRepo.findByInspectorId).toHaveBeenCalledWith('inspector-1', 'tenant-1', 1, 10);
  });

  it('takes the tenant scope from the token, never from the caller', async () => {
    // Passing a tenantId in would be a cross-tenant read primitive.
    await useCase.execute({
      ...input('CL_ADMIN', { tenantId: 'tenant-1' }),
      // @ts-expect-error — asserting the field is not part of the contract
      tenantId: 'tenant-2',
    });

    expect(surveyRepo.findByInspectorId).toHaveBeenCalledWith('inspector-1', 'tenant-1', 1, 10);
  });

  it('fails closed when a tenant-pinned actor carries no tenant', async () => {
    // A null scope reads as "no filter" at the repository, which would return
    // every agency's responses. Swap for the shared requireTenantScope helper
    // once PR #1080 lands.
    await expect(useCase.execute(input('CL_ADMIN', { tenantId: null }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(surveyRepo.findByInspectorId).not.toHaveBeenCalled();
  });

  it('refuses an inspector reading responses, even its own', async () => {
    // The whole anonymity model: the inspector sees the aggregate, never the
    // individual comments or who wrote them.
    await expect(
      useCase.execute(input('INSP', { inspectorId: 'inspector-1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(surveyRepo.findByInspectorId).not.toHaveBeenCalled();
  });

  it('never exposes the respondent or raw identifiers', async () => {
    const result = await useCase.execute(input('AM'));

    const serialised = JSON.stringify(result.data[0]);
    expect(serialised).not.toContain('203.0.113.10');
    expect(serialised).not.toContain('Mozilla');
    expect(serialised).not.toContain('appointment-1');
    expect(serialised).not.toContain('tenant-1');
    // The appointment is identified by its human code instead.
    expect(result.data[0]).toMatchObject({ appointmentCode: 'INS-0042' });
  });

  it('reports pagination metadata', async () => {
    surveyRepo.findByInspectorId.mockResolvedValue({ surveys: [], total: 0 });

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      pagination: { page: 2, pageSize: 25 },
      actor: actor('AM'),
    });

    expect(result).toMatchObject({ total: 0, page: 2, pageSize: 25, data: [] });
  });
});
