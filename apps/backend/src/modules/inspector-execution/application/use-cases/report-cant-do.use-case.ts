import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext, FieldIssueReason } from '@properfy/shared';
import { FIELD_ISSUE_REASON_LABELS, TRANSITION_SOURCE_INSPECTOR_CANT_DO } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ExecuteStatusTransitionUseCase } from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectorFieldEventRepository } from '../../domain/inspector-field-event.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import type { INotifyInspectorUnableService } from '../../domain/notify-inspector-unable.service';
import { InspectorFieldEventEntity } from '../../domain/inspector-field-event.entity';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionAlreadyFinishedError,
  CantDoAlreadyReportedError,
  FieldEventAppointmentNotScheduledError,
  FieldEventIdempotencyPayloadMismatchError,
} from '../../domain/inspection-execution.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { SYSTEM_ACTOR } from '../../../../shared/domain/constants';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { INSPECTOR_FIELD_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const MAX_DECIMAL_10_2 = 99_999_999.99;
const clampAccuracy = (accuracy: number | undefined): number | null =>
  accuracy === undefined ? null : Math.min(accuracy, MAX_DECIMAL_10_2);

export interface ReportCantDoInput {
  appointmentId: string;
  reason: FieldIssueReason;
  note?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  clientOccurredAt?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface ReportCantDoOutput {
  eventId: string;
  appointmentId: string;
  appointmentStatus: 'REJECTED';
  occurredAt: string;
  executionAbandoned: boolean;
}

export class ReportCantDoUseCase {
  constructor(
    private readonly fieldEventRepo: IInspectorFieldEventRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly idempotencyService: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly notifyInspectorUnable: INotifyInspectorUnableService,
    private readonly domainEventBus: DomainEventBus,
    private readonly logger: Logger,
    private readonly prisma: PrismaClient | undefined,
  ) {}

  async execute(input: ReportCantDoInput): Promise<ReportCantDoOutput> {
    const { appointmentId, reason, idempotencyKey, actor } = input;
    const note = input.note?.trim() ? input.note.trim() : null;
    const accuracy = clampAccuracy(input.accuracy);

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'inspector_field_event.cant_do',
      entityType: 'InspectorFieldEvent',
    });
    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }
    const inspectorId = actor.inspectorId;

    const payloadHash = hashIdempotencyPayload({
      reason,
      note,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracy,
      clientOccurredAt: input.clientOccurredAt ?? null,
    });

    const cached = await this.idempotencyService.getWithHash<ReportCantDoOutput>(idempotencyKey, 'cant-do');
    if (cached) {
      if (cached.payloadHash && cached.payloadHash !== payloadHash) {
        throw new FieldEventIdempotencyPayloadMismatchError();
      }
      return cached.response;
    }

    const now = new Date();
    const clientAt = input.clientOccurredAt ? new Date(input.clientOccurredAt) : null;
    const clientOccurredAt = clientAt && !Number.isNaN(clientAt.getTime()) ? clientAt : null;

    let output: ReportCantDoOutput | null = null;
    let didWrite = false;
    let eventId = '';
    let executionAbandoned = false;
    let abandonedExecutionId: string | null = null;
    let inspectorName: string | null = null;
    let tenantId = '';

    await runInTransaction(this.prisma, async ({ tx, defer }) => {
      // First statement: lock the appointment row so finish and can't-do serialize
      // on the same row (consistent order = deadlock-safe).
      await this.fieldEventRepo.lockAppointmentForFieldEvent(appointmentId, tx!);

      // Re-read idempotency inside the transaction: a concurrent request with the
      // same key that committed first is now visible, so we return its result
      // rather than writing a second event.
      const inTx = await this.idempotencyService.getWithHash<ReportCantDoOutput>(idempotencyKey, 'cant-do', tx);
      if (inTx) {
        if (inTx.payloadHash && inTx.payloadHash !== payloadHash) {
          throw new FieldEventIdempotencyPayloadMismatchError();
        }
        output = inTx.response;
        return;
      }

      const result = await this.appointmentRepo.findById(appointmentId, null, tx);
      if (!result) throw new ExecutionAppointmentNotFoundError();
      const { appointment } = result;
      tenantId = appointment.tenantId;
      inspectorName = result.inspectorName ?? null;

      if (appointment.inspectorId !== inspectorId) {
        // Not (or no longer) this inspector's job. If they already reported it and
        // it was rejected + released, tell them clearly; otherwise stay a 404.
        if (appointment.status === 'REJECTED') {
          const last = await this.fieldEventRepo.findLatestCantDoByAppointmentId(appointmentId, tx);
          if (last?.inspectorId === inspectorId) throw new CantDoAlreadyReportedError();
        }
        throw new ExecutionAppointmentNotFoundError();
      }
      if (appointment.status !== 'SCHEDULED') {
        throw new FieldEventAppointmentNotScheduledError();
      }

      // Abandon an open check-in (reject-after-check-in). A finished execution is a
      // race with finish — refuse. An already-abandoned row stays as it is.
      const execution = await this.executionRepo.findByAppointmentId(appointmentId);
      if (execution) {
        if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();
        if (execution.isInProgress()) {
          await this.executionRepo.markAbandoned(execution.id, now, tx);
          executionAbandoned = true;
          abandonedExecutionId = execution.id;
        }
      }

      eventId = randomUUID();
      const event = new InspectorFieldEventEntity({
        id: eventId,
        appointmentId,
        inspectorId,
        tenantId: appointment.tenantId,
        type: 'CANT_DO',
        reasonCode: reason,
        note,
        minutes: null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: accuracy,
        clientOccurredAt,
        createdAt: now,
      });
      await this.fieldEventRepo.create(event, tx);

      const reasonText = FIELD_ISSUE_REASON_LABELS[reason] + (note ? ` — ${note}` : '');
      const transition = await this.executeStatusTransition.executeInTransaction(
        {
          appointmentId,
          targetStatus: 'REJECTED',
          reason: reasonText,
          rejectionReasonCode: 'INSPECTOR_UNABLE',
          expectedStatus: 'SCHEDULED',
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
          auditMetadata: {
            initiatedByUserId: actor.userId,
            initiatedByInspectorId: inspectorId,
            source: TRANSITION_SOURCE_INSPECTOR_CANT_DO,
            fieldEventId: eventId,
          },
        },
        tx,
      );
      defer(transition.runAfterCommit);

      output = {
        eventId,
        appointmentId,
        appointmentStatus: 'REJECTED',
        occurredAt: now.toISOString(),
        executionAbandoned,
      };
      await this.idempotencyService.set(idempotencyKey, 'cant-do', output, 24, payloadHash, tx);
      didWrite = true;
    });

    // After-commit side effects. Each is independently fail-safe: a failure here is
    // logged but never fails the response — the rejection already committed.
    if (didWrite) {
      try {
        this.auditService.log({
          action: 'inspector_field_event.cant_do',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'Appointment',
          entityId: appointmentId,
          tenantId,
          metadata: {
            fieldEventId: eventId,
            reason,
            hasNote: note !== null,
            afterCheckIn: executionAbandoned,
            executionId: abandonedExecutionId,
          },
        });
      } catch (error) {
        this.logger.error({ err: error, appointmentId }, 'Failed to audit inspector cant-do');
      }

      if (abandonedExecutionId) {
        try {
          this.auditService.log({
            action: 'inspection_execution.abandoned',
            actorType: 'USER',
            actorId: actor.userId,
            entityType: 'InspectionExecution',
            entityId: abandonedExecutionId,
            tenantId,
            metadata: { appointmentId, fieldEventId: eventId },
          });
        } catch (error) {
          this.logger.error({ err: error, appointmentId }, 'Failed to audit abandoned execution');
        }
      }

      try {
        await this.notifyInspectorUnable.notify({
          appointmentId,
          tenantId,
          inspectorName,
          reasonCode: reason,
          note,
          occurredAt: now,
        });
      } catch (error) {
        this.logger.error({ err: error, appointmentId }, 'Failed to alert operations of inspector cant-do');
      }

      try {
        await this.domainEventBus.emit({
          type: INSPECTOR_FIELD_EVENTS.RECORDED,
          payload: {
            eventId,
            type: 'CANT_DO',
            appointmentId,
            tenantId,
            inspectorId,
            reason,
            occurredAt: now.toISOString(),
          },
          occurredAt: now,
        });
      } catch (error) {
        this.logger.error({ err: error, appointmentId }, 'Failed to emit inspector field event');
      }

      this.logger.info(
        { appointmentId, inspectorId, reason, afterCheckIn: executionAbandoned },
        'Inspector reported cant-do',
      );
    }

    if (!output) {
      // Unreachable: the closure always sets output on both the write and cached paths.
      throw new ExecutionAppointmentNotFoundError();
    }
    return output;
  }
}
