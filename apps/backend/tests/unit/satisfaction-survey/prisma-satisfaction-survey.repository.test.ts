import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SatisfactionSurveyEntity } from '../../../src/modules/satisfaction-survey/domain/satisfaction-survey.entity';
import { PrismaSatisfactionSurveyRepository } from '../../../src/modules/satisfaction-survey/infrastructure/prisma-satisfaction-survey.repository';

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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'survey-1',
    appointment_id: 'appointment-1',
    tenant_id: 'tenant-1',
    inspector_id: 'inspector-1',
    rating: 5,
    comment: 'Very professional.',
    submitted_at: new Date('2026-08-03T10:00:00.000Z'),
    ip_address: '203.0.113.10',
    user_agent: 'Mozilla/5.0',
    created_at: new Date('2026-08-03T10:00:00.000Z'),
    ...overrides,
  };
}

/** The shape Prisma raises on a unique-constraint violation. */
function uniqueConflict(target: string[]) {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target } });
}

describe('PrismaSatisfactionSurveyRepository', () => {
  const prisma = {
    satisfactionSurvey: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const repo = new PrismaSatisfactionSurveyRepository(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submit', () => {
    it('persists a new response and maps it back to the entity', async () => {
      prisma.satisfactionSurvey.create.mockResolvedValue(makeRow());

      const result = await repo.submit(makeSurvey());

      expect(prisma.satisfactionSurvey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          appointment_id: 'appointment-1',
          tenant_id: 'tenant-1',
          inspector_id: 'inspector-1',
          rating: 5,
          comment: 'Very professional.',
        }),
      });
      expect(result.id).toBe('survey-1');
      expect(result.rating).toBe(5);
      expect(result.comment).toBe('Very professional.');
    });

    it('returns the stored response instead of overwriting it when one already exists', async () => {
      // The whole point of the idempotency contract: a replayed submission must
      // resolve to the FIRST answer, so a second POST cannot rewrite history.
      prisma.satisfactionSurvey.create.mockRejectedValue(uniqueConflict(['appointment_id']));
      prisma.satisfactionSurvey.findFirst.mockResolvedValue(makeRow({ rating: 3, comment: 'It was fine.' }));

      const result = await repo.submit(makeSurvey({ id: 'survey-2', rating: 1, comment: 'Changed my mind.' }));

      expect(result.id).toBe('survey-1');
      expect(result.rating).toBe(3);
      expect(result.comment).toBe('It was fine.');
      expect(prisma.satisfactionSurvey.findFirst).toHaveBeenCalledWith({
        where: { appointment_id: 'appointment-1', tenant_id: 'tenant-1' },
      });
    });

    it('rethrows a unique conflict on any other column', async () => {
      // A collision on the primary key is a real bug, not a replayed submission.
      // Swallowing it would paper over id-generation problems.
      prisma.satisfactionSurvey.create.mockRejectedValue(uniqueConflict(['id']));

      await expect(repo.submit(makeSurvey())).rejects.toMatchObject({ code: 'P2002' });
      expect(prisma.satisfactionSurvey.findFirst).not.toHaveBeenCalled();
    });

    it('rethrows non-conflict database errors untouched', async () => {
      prisma.satisfactionSurvey.create.mockRejectedValue(new Error('connection lost'));

      await expect(repo.submit(makeSurvey())).rejects.toThrow('connection lost');
    });

    it('rethrows the original conflict when the row vanished before the re-read', async () => {
      // Deleted between the failed insert and the lookup: there is no row to
      // return, and inventing one would be worse than surfacing the conflict.
      prisma.satisfactionSurvey.create.mockRejectedValue(uniqueConflict(['appointment_id']));
      prisma.satisfactionSurvey.findFirst.mockResolvedValue(null);

      await expect(repo.submit(makeSurvey())).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('findByAppointmentId', () => {
    it('maps a stored row', async () => {
      prisma.satisfactionSurvey.findFirst.mockResolvedValue(makeRow());

      const result = await repo.findByAppointmentId('appointment-1', 'tenant-1');

      expect(result?.inspectorId).toBe('inspector-1');
    });

    it('returns null when the appointment has no response', async () => {
      prisma.satisfactionSurvey.findFirst.mockResolvedValue(null);

      expect(await repo.findByAppointmentId('appointment-1', 'tenant-1')).toBeNull();
    });
  });

  describe('findByInspectorId', () => {
    it('applies the caller tenant scope and paginates newest first', async () => {
      prisma.$transaction.mockResolvedValue([[makeRow()], 1]);

      const result = await repo.findByInspectorId('inspector-1', 'tenant-1', 2, 10);

      const [findManyArgs] = prisma.satisfactionSurvey.findMany.mock.calls[0];
      expect(findManyArgs).toMatchObject({
        where: { inspector_id: 'inspector-1', tenant_id: 'tenant-1' },
        orderBy: { submitted_at: 'desc' },
        skip: 10,
        take: 10,
      });
      // `total` comes from a separate count() call. If a later change scopes
      // findMany but not count, the tab would report another agency's row count.
      const [countArgs] = prisma.satisfactionSurvey.count.mock.calls[0];
      expect(countArgs.where).toEqual({ inspector_id: 'inspector-1', tenant_id: 'tenant-1' });
      expect(result.total).toBe(1);
      expect(result.surveys).toHaveLength(1);
    });

    it('omits the tenant filter only when the caller is unscoped', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await repo.findByInspectorId('inspector-1', null, 1, 10);

      const [findManyArgs] = prisma.satisfactionSurvey.findMany.mock.calls[0];
      expect(findManyArgs.where).toEqual({ inspector_id: 'inspector-1' });
      expect(findManyArgs.where).not.toHaveProperty('tenant_id');
    });
  });
});
