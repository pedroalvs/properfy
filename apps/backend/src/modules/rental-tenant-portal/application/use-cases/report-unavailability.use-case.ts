import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IInspectionExecutionRepository } from '../../../inspector-execution/domain/inspection-execution.repository';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import type { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { AvailableSlot } from '@properfy/shared';
import type {
  ExecuteStatusTransitionInput,
  ExecuteStatusTransitionOutput,
} from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import { SYSTEM_ACTOR } from '../../../../shared/domain/constants';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { isPortalUnanswerableStatus } from '../../domain/portal-statuses';
import {
  PortalAppointmentInactiveError,
  PortalInspectionAlreadyStartedError,
  PortalTokenAlreadyUsedError,
} from '../../domain/rental-tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

interface IStatusTransitionUseCase {
  execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput>;
}

/** Reason recorded on the audit trail and offered to the agency notice. */
const REJECTION_REASON = 'Rental tenant reported they cannot attend, via the portal';

export interface ReportUnavailabilityInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  isPastConfirmCutoff: boolean;
  isUsed: boolean;
  restrictions?: {
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    availableSlotsJson?: AvailableSlot[] | null;
    notes: string | null;
  };
  rentalTenantNote?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export class ReportUnavailabilityUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    /**
     * Required, not optional like the dependencies below it: a decline that does
     * not reject the appointment is the bug this use case exists to prevent, so
     * an unwired transition must fail loudly at construction rather than
     * silently degrade to the old confirmation-status-only behaviour.
     */
    private readonly statusTransition: IStatusTransitionUseCase,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly executionRepo?: IInspectionExecutionRepository,
    private readonly domainEventBus?: DomainEventBus,
    private readonly tokenRepo?: IRentalTenantPortalTokenRepository,
    private readonly cycleService?: ConfirmationCycleService,
    private readonly logger?: Logger,
  ) {}

  async execute(input: ReportUnavailabilityInput) {
    // 1. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 2. Idempotent: already UNAVAILABLE — return success without re-recording
    // the activity, audit and notification.
    //
    // The confirmation status is written before the rejection (they cannot share
    // a transaction: the transition is its own use case). So "UNAVAILABLE but not
    // yet rejected" is a real, reachable state — a decline whose transition threw.
    // Returning success there would report the tenant's retry as done while the
    // appointment stayed on the inspector's run forever, which is precisely the
    // failure this use case exists to prevent. Re-drive the rejection instead, so
    // the retry heals rather than masks. Guarded by the unanswerable check because
    // an operator may legitimately have moved it on in the meantime.
    //
    // Two healing retries landing at once both miss the idempotency cache (it is
    // populated on completion, not on entry), so the loser gets an
    // AppointmentInvalidTransitionError for REJECTED → REJECTED. Deliberately not
    // swallowed: the end state is already correct, a further retry returns success,
    // and catching transition errors here would hide real ones later.
    if (appointment.rentalTenantConfirmationStatus === 'UNAVAILABLE') {
      if (!isPortalUnanswerableStatus(appointment.status)) {
        await this.rejectDeclined(input, appointment);
      }
      return {
        rentalTenantConfirmationStatus: 'UNAVAILABLE' as const,
        urgentMode: false,
      };
    }

    // 2b. Block if token has already been used for a mutation
    if (input.isUsed) {
      throw new PortalTokenAlreadyUsedError();
    }

    // 3. Block where the "will you be home?" question no longer applies. This
    // includes REJECTED: declining an already-rejected appointment would try to
    // reject it a second time. Changing time still works from REJECTED.
    if (isPortalUnanswerableStatus(appointment.status)) {
      throw new PortalAppointmentInactiveError();
    }

    // 4. After inspection start, the portal becomes view-only for every action.
    const execution = this.executionRepo
      ? await this.executionRepo.findByAppointmentId(input.appointmentId)
      : null;
    if (execution) {
      throw new PortalInspectionAlreadyStartedError();
    }

    // 4b. Atomically claim the token before the first side effect. The
    // conditional write is the real replay guard — the isUsed fast-path above
    // is stale under concurrency, so two racing requests must resolve here.
    if (this.tokenRepo) {
      const claimed = await this.tokenRepo.tryClaim(input.tokenId, input.appointmentId);
      if (!claimed) {
        throw new PortalTokenAlreadyUsedError();
      }
    }

    try {
      await this.applyUnavailability(input, appointment);
    } catch (error) {
      // Best-effort release so the tenant can retry with the same link;
      // never mask the original failure.
      if (this.tokenRepo) {
        try {
          await this.tokenRepo.releaseClaim(input.tokenId, input.appointmentId);
        } catch {
          // release failure leaves the token consumed — fail-closed
        }
      }
      throw error;
    }

    // 4c. Hand the link back. A decline is no longer the tenant's last possible
    // action: the appointment is now REJECTED and the change-time picker is the
    // way to revive it, so consuming the token here would strand them. The
    // replay guard for the decline itself is the "already UNAVAILABLE"
    // short-circuit at the top, not the claim.
    //
    // Not allowed to fail the request: everything above is already committed, so
    // throwing here would show the tenant an error for a decline that worked.
    // Logged instead, because the outcome — token consumed, change-time broken
    // for this link — still needs to be visible.
    if (this.tokenRepo) {
      try {
        await this.tokenRepo.releaseClaim(input.tokenId, input.appointmentId);
      } catch (err) {
        this.logger?.error(
          { err, appointmentId: input.appointmentId, tokenId: input.tokenId },
          'Failed to release the portal token after a decline; the tenant cannot change time with this link',
        );
      }
    }

    return {
      rentalTenantConfirmationStatus: 'UNAVAILABLE' as const,
      urgentMode: input.isPastConfirmCutoff,
    };
  }

  /**
   * Moves a declined appointment to REJECTED.
   *
   * Routed through the sovereign transition use case rather than a direct
   * repository write, so the rejection gets the same audit entry, domain event,
   * empty-group cleanup and notification as any operator-driven rejection.
   * `SCHEDULED → REJECTED` and `AWAITING_INSPECTOR → REJECTED` both already list
   * SYS in TRANSITION_RULES.
   *
   * The idempotency key is keyed on the token rather than the attempt, so the
   * healing retry above reuses the original decision instead of minting a second
   * rejection.
   */
  private async rejectDeclined(
    input: ReportUnavailabilityInput,
    appointment: AppointmentEntity,
  ): Promise<void> {
    await this.statusTransition.execute({
      appointmentId: input.appointmentId,
      targetStatus: 'REJECTED',
      reason: REJECTION_REASON,
      rejectionReasonCode: 'TENANT_DECLINED',
      idempotencyKey: `portal_decline:${input.appointmentId}:${input.tokenId}`,
      actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
    });
  }

  private async applyUnavailability(input: ReportUnavailabilityInput, appointment: AppointmentEntity): Promise<void> {
    // 4. Snapshot previous values
    const previousValues = {
      rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
    };

    // 5. Update appointment confirmation status via cycle service (if wired)
    if (this.cycleService) {
      try {
        await this.cycleService.markUnavailable(input.appointmentId, appointment.tenantId);
      } catch {
        // No active cycle (pre-feature appointment) — fall back to direct denorm write
        await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
          rentalTenantConfirmationStatus: 'UNAVAILABLE',
        });
      }
      if (input.rentalTenantNote !== undefined) {
        await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
          rentalTenantNote: input.rentalTenantNote,
        });
      }
    } else {
      const payload: Record<string, unknown> = { rentalTenantConfirmationStatus: 'UNAVAILABLE' };
      if (input.rentalTenantNote !== undefined) payload.rentalTenantNote = input.rentalTenantNote;
      await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, payload);
    }

    // 6. Save restrictions if provided
    if (input.restrictions) {
      const restriction = new AppointmentRestrictionEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        isHome: input.restrictions.isHome,
        unavailableDaysJson: input.restrictions.unavailableDaysJson,
        unavailableHoursJson: input.restrictions.unavailableHoursJson,
        availableSlotsJson: input.restrictions.availableSlotsJson ?? null,
        notes: input.restrictions.notes,
        source: 'RENTAL_TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.appointmentRepo.replaceRestrictions(input.appointmentId, restriction);
    }

    // 7. Record UNAVAILABLE_REPORTED activity — include availableSlotsJson when present (M6)
    const newValuesJson: Record<string, unknown> = { rentalTenantConfirmationStatus: 'UNAVAILABLE' };
    if (input.restrictions?.availableSlotsJson) {
      newValuesJson['availableSlotsJson'] = input.restrictions.availableSlotsJson;
    }

    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'UNAVAILABLE_REPORTED',
      previousValuesJson: previousValues,
      newValuesJson,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 8. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.unavailability_reported',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: { rentalTenantConfirmationStatus: 'UNAVAILABLE' },
      metadata: {
        origin: 'tenant_portal',
        urgentMode: input.isPastConfirmCutoff,
      },
      ipAddress: input.ipAddress ?? undefined,
    });

    // 8b. A decline ends the appointment: there is no one to let the inspector
    // in, so it leaves the run and waits to be rescheduled against the weekly
    // availability recorded above.
    await this.rejectDeclined(input, appointment);

    // 9. Side effect: notify operator of unavailability
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({ appointmentId: input.appointmentId, tenantId: appointment.tenantId, action: 'UNAVAILABLE' });
      } catch {
        // fire-and-forget — notification failure must not affect the action
      }
    }

    // 10. Emit domain event
    if (this.domainEventBus) {
      await this.domainEventBus.emit({
        type: TENANT_PORTAL_EVENTS.UNAVAILABLE,
        payload: {
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          tokenId: input.tokenId,
        },
        occurredAt: new Date(),
      });
    }
  }
}
