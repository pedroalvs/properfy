import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext, LateNoticeReason } from '@properfy/shared';
import { zonedWallTimeToUtc } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectorFieldEventRepository } from '../../domain/inspector-field-event.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import { InspectorFieldEventEntity } from '../../domain/inspector-field-event.entity';
import {
  ExecutionAppointmentNotFoundError,
  LateNoticeNotAllowedError,
  FieldEventIdempotencyPayloadMismatchError,
} from '../../domain/inspection-execution.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ITenantTimezoneLookup } from '../../../../shared/application/tenant-timezone';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { INSPECTOR_FIELD_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import { resolveEffectiveEventTime } from '../../domain/client-occurred-at';
import {
  computeEstimatedArrivalAt,
  type IPublishedStopStartReader,
} from '../../domain/late-notice';

const MAX_DECIMAL_10_2 = 99_999_999.99;
const clampAccuracy = (accuracy: number | undefined): number | null =>
  accuracy === undefined ? null : Math.min(accuracy, MAX_DECIMAL_10_2);

export interface ReportLateNoticeInput {
  appointmentId: string;
  reason: LateNoticeReason;
  minutesLate: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  clientOccurredAt?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface ReportLateNoticeOutput {
  eventId: string;
  appointmentId: string;
  occurredAt: string;
  reason: LateNoticeReason;
  minutesLate: number;
  referenceAt: string;
  referenceSource: 'PUBLISHED_PLAN' | 'WINDOW_START';
  estimatedArrivalAt: string;
}

/**
 * "Running late" (F03, L-F03-04 / D23). Appends a LATE_NOTICE field event and
 * returns a server-computed ETA. No status change, no notification — F05/F06/F07
 * consume the event and must not recompute the arrival (they reuse
 * `computeEstimatedArrivalAt`).
 */
export class ReportLateNoticeUseCase {
  constructor(
    private readonly fieldEventRepo: IInspectorFieldEventRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly publishedStopStartReader: IPublishedStopStartReader,
    private readonly tenantTimezoneLookup: ITenantTimezoneLookup | undefined,
    private readonly domainEventBus: DomainEventBus,
    private readonly logger: Logger,
    private readonly prisma: PrismaClient | undefined,
  ) {}

  async execute(input: ReportLateNoticeInput): Promise<ReportLateNoticeOutput> {
    const { appointmentId, reason, minutesLate, idempotencyKey, actor } = input;
    const accuracy = clampAccuracy(input.accuracy);

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'inspector_field_event.late_notice',
      entityType: 'InspectorFieldEvent',
    });
    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }
    const inspectorId = actor.inspectorId;

    const payloadHash = hashIdempotencyPayload({
      reason,
      minutesLate,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracy,
      clientOccurredAt: input.clientOccurredAt ?? null,
    });

    const cached = await this.idempotencyService.getWithHash<ReportLateNoticeOutput>(
      idempotencyKey,
      'late-notice',
    );
    if (cached) {
      if (cached.payloadHash && cached.payloadHash !== payloadHash) {
        throw new FieldEventIdempotencyPayloadMismatchError();
      }
      return cached.response;
    }

    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result || result.appointment.inspectorId !== inspectorId) {
      throw new ExecutionAppointmentNotFoundError();
    }
    const { appointment } = result;
    if (appointment.status !== 'SCHEDULED') {
      throw new ExecutionAppointmentNotFoundError();
    }

    const agencyTz =
      (await this.tenantTimezoneLookup?.getTenantTimezone(appointment.tenantId)) ?? PLATFORM_TIMEZONE;
    const now = new Date();
    const scheduledDate = appointment.scheduledDate.toISOString().slice(0, 10);
    if (civilDateInTimezone(now, agencyTz) !== scheduledDate) {
      throw new LateNoticeNotAllowedError(
        'You can only send a running-late notice on the day of the job.',
      );
    }

    // A live check-in means the inspector is on site — "running late" no longer
    // applies. An abandoned execution (rejected-after-check-in, awaiting re-offer)
    // does not block it.
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (execution && !execution.isAbandoned()) {
      if (execution.isFinished()) {
        throw new LateNoticeNotAllowedError('This job is already finished.');
      }
      if (execution.isInProgress()) {
        throw new LateNoticeNotAllowedError("You've already checked in to this job.");
      }
    }

    const effectiveNoticeAt = resolveEffectiveEventTime(input.clientOccurredAt, now).effectiveAt;
    const windowStartAt = zonedWallTimeToUtc(scheduledDate, appointment.timeSlotStart, agencyTz);
    const publishedStart = await this.publishedStopStartReader.find(
      appointmentId,
      inspectorId,
      scheduledDate,
    );
    const reference = publishedStart ?? windowStartAt;
    const referenceSource: 'PUBLISHED_PLAN' | 'WINDOW_START' = publishedStart
      ? 'PUBLISHED_PLAN'
      : 'WINDOW_START';
    const estimatedArrivalAt = computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate);

    const clientAt = input.clientOccurredAt ? new Date(input.clientOccurredAt) : null;
    const clientOccurredAt = clientAt && !Number.isNaN(clientAt.getTime()) ? clientAt : null;

    const eventId = randomUUID();
    const output: ReportLateNoticeOutput = {
      eventId,
      appointmentId,
      occurredAt: now.toISOString(),
      reason,
      minutesLate,
      referenceAt: reference.toISOString(),
      referenceSource,
      estimatedArrivalAt: estimatedArrivalAt.toISOString(),
    };

    await runInTransaction(this.prisma, async ({ tx }) => {
      // Re-read idempotency inside the transaction so a concurrent request with the
      // same key that committed first returns its result instead of writing twice.
      const inTx = await this.idempotencyService.getWithHash<ReportLateNoticeOutput>(
        idempotencyKey,
        'late-notice',
        tx,
      );
      if (inTx) {
        if (inTx.payloadHash && inTx.payloadHash !== payloadHash) {
          throw new FieldEventIdempotencyPayloadMismatchError();
        }
        Object.assign(output, inTx.response);
        return;
      }

      const event = new InspectorFieldEventEntity({
        id: eventId,
        appointmentId,
        inspectorId,
        tenantId: appointment.tenantId,
        type: 'LATE_NOTICE',
        reasonCode: reason,
        note: null,
        minutes: minutesLate,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: accuracy,
        clientOccurredAt,
        createdAt: now,
      });
      await this.fieldEventRepo.create(event, tx);
      await this.idempotencyService.set(idempotencyKey, 'late-notice', output, 24, payloadHash, tx);
    });

    // After-commit side effects — logged, never fail the response.
    try {
      this.auditService.log({
        action: 'inspector_field_event.late_notice',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: {
          fieldEventId: eventId,
          reason,
          minutesLate,
          estimatedArrivalAt: output.estimatedArrivalAt,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, appointmentId }, 'Failed to audit inspector late-notice');
    }

    try {
      await this.domainEventBus.emit({
        type: INSPECTOR_FIELD_EVENTS.RECORDED,
        payload: {
          eventId,
          type: 'LATE_NOTICE',
          appointmentId,
          tenantId: appointment.tenantId,
          inspectorId,
          reason,
          minutesLate,
          estimatedArrivalAt: output.estimatedArrivalAt,
          occurredAt: output.occurredAt,
        },
        occurredAt: now,
      });
    } catch (error) {
      this.logger.error({ err: error, appointmentId }, 'Failed to emit inspector late-notice event');
    }

    return output;
  }
}
