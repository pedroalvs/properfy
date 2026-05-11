import type { AuthContext, BulkActionResultItem } from '@properfy/shared';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { UpdateAppointmentUseCase } from './update-appointment.use-case';
import { dayKeyInTz, mapErrorToResult } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_reschedule';
const IDEMPOTENCY_TTL_HOURS = 36;

export interface BulkRescheduleAppointmentsInput {
  appointmentIds: string[];
  /** ISO date (YYYY-MM-DD) or full datetime — normalised to YYYY-MM-DD here. */
  newDate: string;
  newTimeSlot?: string;
  actor: AuthContext;
  actorTimezone?: string;
}

export interface BulkRescheduleAppointmentsOutput {
  results: BulkActionResultItem[];
}

/**
 * 025 §FR-421 — Bulk reschedule from the map flow.
 *
 * Delegates per-item to `UpdateAppointmentUseCase`, which already owns
 * the editable-status guard (DRAFT / AWAITING_INSPECTOR), CL_USER flag
 * check (`reschedule_appointments`), time-slot catalog validation and
 * audit logging. The bulk wrapper only adds the per-item idempotency
 * sentinel and the typed result mapping.
 */
export class BulkRescheduleAppointmentsUseCase {
  constructor(
    private readonly updateAppointment: UpdateAppointmentUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkRescheduleAppointmentsInput): Promise<BulkRescheduleAppointmentsOutput> {
    const dayKey = dayKeyInTz(this.clock(), input.actorTimezone);
    const results: BulkActionResultItem[] = [];

    // Normalise to YYYY-MM-DD. UpdateAppointmentUseCase parses with `new Date(value)`
    // which expects a YYYY-MM-DD or full ISO string; using only the date portion
    // keeps timezone semantics stable per `feedback_client_side_sorting`-style
    // "use the actor's local intent".
    const newDate = input.newDate.length >= 10 ? input.newDate.slice(0, 10) : input.newDate;

    for (const appointmentId of input.appointmentIds) {
      const idemKey = `bulk_reschedule:${appointmentId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(
        idemKey,
        IDEMPOTENCY_SCOPE,
      );
      if (cached) {
        results.push({ appointmentId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }

      try {
        await this.updateAppointment.execute({
          appointmentId,
          data: {
            scheduledDate: newDate,
            ...(input.newTimeSlot ? { timeSlot: input.newTimeSlot } : {}),
          },
          actor: input.actor,
        });
        const result: BulkActionResultItem = { appointmentId, status: 'OK' };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (err) {
        results.push(mapErrorToResult(appointmentId, err));
      }
    }

    return { results };
  }
}
