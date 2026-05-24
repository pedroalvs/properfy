import type { AuthContext, BulkActionResultItem } from '@properfy/shared';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { ReopenForRescheduleUseCase } from './reopen-for-reschedule.use-case';
import { dayKeyInTz, mapErrorToResult } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_reopen_reschedule';
const IDEMPOTENCY_TTL_HOURS = 36;

export interface BulkReopenForRescheduleInput {
  appointmentIds: string[];
  newDate: string;
  newTimeSlot: string;
  reason?: string;
  actor: AuthContext;
  actorTimezone?: string;
}

export interface BulkReopenForRescheduleOutput {
  results: BulkActionResultItem[];
}

/**
 * 026 §FR-540..545 — Bulk reopen for reschedule from the map flow.
 *
 * Per-item wrapper around `ReopenForRescheduleUseCase` (spec 006 GAP-003),
 * which the 026 round already extended to revoke active portal tokens after
 * each reschedule. This use case adds three things on top:
 *
 *  1. **Same-group precheck.** Bulk reschedule is intentionally limited to
 *     appointments inside a single service group in this cycle — operators
 *     should not be able to reschedule a heterogeneous selection in one
 *     action because the downstream group lifecycle (republish, reassign
 *     inspector) is per-group. Mixed selections / non-grouped items return
 *     `INVALID_SCOPE` for every item without applying anything (no partial).
 *
 *  2. **Per-day idempotency** with the `bulk_reopen_reschedule` scope key
 *     so a same-day retry returns `IDEMPOTENT_REPLAY` without re-firing
 *     the (potentially expensive) reopen path.
 *
 *  3. **Mixed-result envelope** — typed per-item statuses via
 *     `mapErrorToResult` so a single failed item doesn't kill the batch.
 *
 * Cross-group bulk reschedule is GAP-501 (out of scope for 026).
 */
export class BulkReopenForRescheduleUseCase {
  constructor(
    private readonly reopenForReschedule: ReopenForRescheduleUseCase,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkReopenForRescheduleInput): Promise<BulkReopenForRescheduleOutput> {
    // Same-group precheck. Fetch all appointments to inspect their
    // serviceGroupId; reject the entire batch with INVALID_SCOPE if the
    // selection spans groups or contains a non-grouped item.
    // Cache the fetched appointments for the 30-day window check below.
    const groupIds = new Set<string | null>();
    const notFound: string[] = [];
    const fetchedAppointments = new Map<string, { scheduledDate: Date }>();
    for (const apptId of input.appointmentIds) {
      const found = await this.appointmentRepo.findById(apptId, null);
      if (!found) {
        notFound.push(apptId);
        continue;
      }
      groupIds.add(found.appointment.serviceGroupId ?? null);
      fetchedAppointments.set(apptId, { scheduledDate: found.appointment.scheduledDate });
    }

    if (groupIds.size > 1 || groupIds.has(null)) {
      return {
        results: input.appointmentIds.map((id) => {
          if (notFound.includes(id)) {
            return {
              appointmentId: id,
              status: 'NOT_FOUND' as const,
              error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
            };
          }
          return {
            appointmentId: id,
            status: 'INVALID_TRANSITION' as const,
            error: {
              code: 'INVALID_SCOPE',
              message: 'Bulk reschedule limited to appointments within the same service group',
            },
          };
        }),
      };
    }

    const dayKey = dayKeyInTz(this.clock(), input.actorTimezone);
    const results: BulkActionResultItem[] = [];

    for (const apptId of input.appointmentIds) {
      if (notFound.includes(apptId)) {
        results.push({
          appointmentId: apptId,
          status: 'NOT_FOUND',
          error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
        });
        continue;
      }

      // 30-day window check: new date must be within 30 days of the current scheduledDate.
      const MAX_RESCHEDULE_WINDOW_DAYS = 30;
      const cachedAppt = fetchedAppointments.get(apptId);
      if (cachedAppt) {
        const anchorDate = new Date(cachedAppt.scheduledDate);
        const newDate = new Date(input.newDate.length >= 10 ? input.newDate.slice(0, 10) : input.newDate);
        const diffDays = Math.floor((newDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > MAX_RESCHEDULE_WINDOW_DAYS) {
          results.push({
            appointmentId: apptId,
            status: 'INVALID_TRANSITION',
            error: {
              code: 'INVALID_DATE_WINDOW',
              message: `New date exceeds ${MAX_RESCHEDULE_WINDOW_DAYS}-day rescheduling window from ${anchorDate.toISOString().slice(0, 10)}`,
            },
          });
          continue;
        }
      }

      const idemKey = `bulk_reopen_reschedule:${apptId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(idemKey, IDEMPOTENCY_SCOPE);
      if (cached) {
        results.push({ appointmentId: apptId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }

      try {
        await this.reopenForReschedule.execute({
          appointmentId: apptId,
          newScheduledDate: input.newDate.length >= 10 ? input.newDate.slice(0, 10) : input.newDate,
          newTimeSlot: input.newTimeSlot,
          ...(input.reason ? { reason: input.reason } : {}),
          actorTimezone: input.actorTimezone,
          actor: input.actor,
        });
        const result: BulkActionResultItem = { appointmentId: apptId, status: 'OK' };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (err) {
        results.push(mapErrorToResult(apptId, err));
      }
    }

    return { results };
  }
}
