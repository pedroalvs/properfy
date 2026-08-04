import type { PrismaClient } from '@prisma/client';
import { SatisfactionSurveyEntity } from '../domain/satisfaction-survey.entity';
import type {
  FindSurveysResult,
  ISatisfactionSurveyRepository,
} from '../domain/satisfaction-survey.repository';

function mapToEntity(row: {
  id: string;
  appointment_id: string;
  tenant_id: string;
  inspector_id: string;
  rating: number;
  comment: string | null;
  submitted_at: Date;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}): SatisfactionSurveyEntity {
  return new SatisfactionSurveyEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    tenantId: row.tenant_id,
    inspectorId: row.inspector_id,
    rating: row.rating,
    comment: row.comment,
    submittedAt: row.submitted_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  });
}

/**
 * Duck-typed unique-conflict detection, narrowed to a single column.
 *
 * Same reasoning as `shared/domain/retry-on-unique-conflict.ts`: a blanket
 * `P2002` catch would also swallow a primary-key collision and quietly turn an
 * id-generation bug into a successful-looking submission. On Postgres Prisma
 * reports `meta.target` as an array even for a single-column index; the string
 * branch covers connectors that report a bare constraint name.
 */
function isUniqueConflictOn(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code: unknown }).code !== 'P2002') return false;

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === 'string') return target === column;
  return Array.isArray(target) && target.includes(column);
}

export class PrismaSatisfactionSurveyRepository implements ISatisfactionSurveyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAppointmentId(appointmentId: string): Promise<SatisfactionSurveyEntity | null> {
    const row = await this.prisma.satisfactionSurvey.findUnique({
      where: { appointment_id: appointmentId },
    });
    return row ? mapToEntity(row) : null;
  }

  /**
   * Insert-then-read rather than `upsert`: an upsert's update branch would
   * replace the tenant's first answer with a replayed second one, and the whole
   * feature rests on a response being immutable once given.
   */
  async submit(survey: SatisfactionSurveyEntity): Promise<SatisfactionSurveyEntity> {
    try {
      const row = await this.prisma.satisfactionSurvey.create({
        data: {
          id: survey.id,
          appointment_id: survey.appointmentId,
          tenant_id: survey.tenantId,
          inspector_id: survey.inspectorId,
          rating: survey.rating,
          comment: survey.comment,
          submitted_at: survey.submittedAt,
          ip_address: survey.ipAddress,
          user_agent: survey.userAgent,
        },
      });
      return mapToEntity(row);
    } catch (error) {
      if (!isUniqueConflictOn(error, 'appointment_id')) throw error;

      const existing = await this.findByAppointmentId(survey.appointmentId);
      // Deleted between the failed insert and this read. There is nothing
      // truthful to return, so surface the original conflict.
      if (!existing) throw error;
      return existing;
    }
  }

  async findByInspectorId(
    inspectorId: string,
    tenantId: string | null,
    page: number,
    pageSize: number,
  ): Promise<FindSurveysResult> {
    const where = tenantId
      ? { inspector_id: inspectorId, tenant_id: tenantId }
      : { inspector_id: inspectorId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.satisfactionSurvey.findMany({
        where,
        orderBy: { submitted_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.satisfactionSurvey.count({ where }),
    ]);

    return { surveys: rows.map(mapToEntity), total };
  }
}
