import type { PrismaClient } from '@prisma/client';
import type {
  ICompletionReminderReader,
  CompletionReminderCandidate,
  CompletionReminderExecutionState,
  InProgressExecutionRef,
} from '../domain/completion-reminder.reader';

const DAY_MS = 86_400_000;

function formatAddress(
  property: { street: string; suburb: string; state: string; postcode: string } | null,
): string {
  return property
    ? `${property.street}, ${property.suburb} ${property.state} ${property.postcode}`
    : '';
}

function executionState(
  execution: { finished_at: Date | null; abandoned_at: Date | null } | null,
): CompletionReminderExecutionState {
  if (!execution || execution.abandoned_at !== null) return 'NONE';
  if (execution.finished_at !== null) return 'FINISHED';
  return 'IN_PROGRESS';
}

export class PrismaCompletionReminderReader implements ICompletionReminderReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findCandidates(now: Date): Promise<CompletionReminderCandidate[]> {
    // scheduled_date is a @db.Date at UTC midnight. Span [now-1d, now+1d] in whole
    // civil days so every agency timezone's "today" is covered; the use case then
    // narrows to the agency's civil today.
    const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS);
    const endDay = new Date(startDay.getTime() + 3 * DAY_MS);

    const rows = await this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        inspector_id: { not: null },
        deleted_at: null,
        scheduled_date: { gte: startDay, lt: endDay },
      },
      select: {
        id: true,
        tenant_id: true,
        inspector_id: true,
        appointment_number: true,
        scheduled_date: true,
        time_slot_end: true,
        tenant: { select: { appointment_code_prefix: true } },
        property: { select: { street: true, suburb: true, state: true, postcode: true } },
        execution: { select: { finished_at: true, abandoned_at: true } },
      },
    });

    return rows.map((row) => {
      const prefix = row.tenant?.appointment_code_prefix ?? 'INS';
      const code = `${prefix}-${String(row.appointment_number).padStart(4, '0')}`;
      return {
        appointmentId: row.id,
        tenantId: row.tenant_id,
        // `inspector_id: { not: null }` guarantees this is present.
        inspectorId: row.inspector_id as string,
        appointmentCode: code,
        propertyAddress: formatAddress(row.property),
        scheduledDate: row.scheduled_date,
        timeSlotEnd: row.time_slot_end,
        executionState: executionState(row.execution),
      } satisfies CompletionReminderCandidate;
    });
  }

  async findInProgressByInspectorIds(inspectorIds: string[]): Promise<InProgressExecutionRef[]> {
    if (inspectorIds.length === 0) return [];
    const rows = await this.prisma.inspectionExecution.findMany({
      where: {
        inspector_id: { in: inspectorIds },
        finished_at: null,
        abandoned_at: null,
      },
      select: { inspector_id: true, appointment_id: true, started_at: true },
    });
    return rows.map((row) => ({
      inspectorId: row.inspector_id,
      appointmentId: row.appointment_id,
      startedAt: row.started_at,
    }));
  }
}
