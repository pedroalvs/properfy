import type { AuthContext, AvailableSlot } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import { AppointmentNotFoundError, AppointmentInvalidTransitionError } from '../../domain/appointment.errors';
import { AppointmentRestrictionEntity } from '../../domain/appointment-restriction.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ConfirmationCycleService } from '../services/confirmation-cycle.service';
import { isPortalUnanswerableStatus } from '../../../rental-tenant-portal/domain/portal-statuses';
import { ConfirmationCycleNotFoundError } from '../../domain/confirmation-cycle.errors';
import type {
  ExecuteStatusTransitionInput,
  ExecuteStatusTransitionOutput,
} from './execute-status-transition.use-case';

interface IStatusTransitionUseCase {
  execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput>;
}

/** Mirrors the wording the portal decline records, so the audit trail reads alike. */
const REJECTION_REASON = 'Rental tenant reported they cannot attend, recorded by the operator';

export interface SetRentalTenantAvailabilityInput {
  appointmentId: string;
  availableSlots: AvailableSlot[];
  markUnavailable: boolean;
  /**
   * Forwarded to the rejection transition when `markUnavailable` is set, so a
   * client retry after a lost response replays the original decision instead of
   * hitting `AppointmentInvalidTransitionError` on an already-REJECTED row.
   */
  idempotencyKey?: string;
  actor: AuthContext;
}

export interface SetRentalTenantAvailabilityOutput {
  id: string;
  availableSlots: AvailableSlot[];
  rentalTenantConfirmationStatus: string;
}

/**
 * Records the weekly availability a rental tenant gave outside the portal.
 *
 * Before this, `appointment_restrictions.available_slots_json` had a single
 * writer — the portal decline — so availability given over the phone was lost.
 *
 * Two permission tiers, deliberately different:
 *  - recording availability is data entry: AM, OP and CL_ADMIN;
 *  - `markUnavailable` rejects the appointment, and the state machine admits
 *    only AM/OP/SYS to any `→ REJECTED` edge, so CL_ADMIN is refused there.
 */
export class SetRentalTenantAvailabilityUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly statusTransition: IStatusTransitionUseCase,
    private readonly cycleService?: ConfirmationCycleService,
  ) {}

  async execute(input: SetRentalTenantAvailabilityInput): Promise<SetRentalTenantAvailabilityOutput> {
    const { appointmentId, availableSlots, markUnavailable, idempotencyKey, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment.set_rental_tenant_availability',
      entityType: 'Appointment',
    });

    // Checked before any write: a CL_ADMIN who ticked the box must get a clean
    // refusal, not availability saved next to a decline that never happened.
    if (markUnavailable) {
      this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
        action: 'appointment.rental_tenant_declined',
        entityType: 'Appointment',
      });
    }

    // AM/OP are platform-wide; CL_ADMIN is pinned to their JWT tenant.
    const tenantScope = actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;
    const result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    if (!result) throw new AppointmentNotFoundError();

    const { appointment } = result;
    // Defense in depth: the actor must own the row even if the repo ever
    // loosens its tenant filter.
    if (actor.role === 'CL_ADMIN' && appointment.tenantId !== actor.tenantId) {
      throw new AppointmentNotFoundError();
    }

    // Declining an appointment the "will you be home?" question no longer
    // applies to would try to reject it twice. Recording availability alone is
    // still fine on a terminal appointment — it is just data.
    if (markUnavailable && isPortalUnanswerableStatus(appointment.status)) {
      throw new AppointmentInvalidTransitionError(appointment.status, 'REJECTED');
    }

    const previous = result.restrictions ?? [];
    // At most one row exists and `replaceRestrictions` overwrites it wholesale,
    // so the operator's own fields have to ride along or they are destroyed.
    // Prefer the row that already carries slots; fall back to whatever single
    // row is there.
    const existing = previous.find((r) => r.availableSlotsJson?.length) ?? previous[0] ?? null;

    const restriction = new AppointmentRestrictionEntity({
      // Reusing the id preserves createdAt across the delete+insert.
      id: existing?.id ?? crypto.randomUUID(),
      appointmentId,
      isHome: existing?.isHome ?? false,
      unavailableDaysJson: existing?.unavailableDaysJson ?? null,
      unavailableHoursJson: existing?.unavailableHoursJson ?? null,
      availableSlotsJson: availableSlots,
      notes: existing?.notes ?? null,
      // A brand-new row is stamped RENTAL_TENANT_PORTAL, not OPERATOR: the edit
      // drawer reads "a row whose source is not RENTAL_TENANT_PORTAL" as "the
      // operator set an access restriction", and stamping OPERATOR here would
      // switch that toggle on by itself for every appointment touched.
      source: existing?.source ?? 'RENTAL_TENANT_PORTAL',
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
    await this.appointmentRepo.replaceRestrictions(appointmentId, restriction);

    let confirmationStatus = appointment.rentalTenantConfirmationStatus;
    if (markUnavailable) {
      confirmationStatus = 'UNAVAILABLE';
      await this.markTenantUnavailable(appointmentId, appointment.tenantId);
      // The appointment ends here: nobody can let the inspector in, so it leaves
      // the run and waits to be rescheduled against the availability just saved.
      // Attributed to the operator who did it, unlike the portal's SYS actor.
      await this.statusTransition.execute({
        appointmentId,
        targetStatus: 'REJECTED',
        reason: REJECTION_REASON,
        rejectionReasonCode: 'TENANT_DECLINED',
        ...(idempotencyKey ? { idempotencyKey } : {}),
        actor,
      });
    }

    this.auditService.log({
      action: 'appointment.rental_tenant_availability_set',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      before: {
        availableSlotsJson: existing?.availableSlotsJson ?? null,
        rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
      },
      after: {
        availableSlotsJson: availableSlots,
        rentalTenantConfirmationStatus: confirmationStatus,
      },
      metadata: { markUnavailable },
    });

    return { id: appointmentId, availableSlots, rentalTenantConfirmationStatus: confirmationStatus };
  }

  /** Cycle service when wired, direct denorm write for pre-feature appointments. */
  private async markTenantUnavailable(appointmentId: string, tenantId: string): Promise<void> {
    if (this.cycleService) {
      try {
        await this.cycleService.markUnavailable(appointmentId, tenantId);
        return;
      } catch (error) {
        // ONLY the pre-feature case falls through. A broad catch here would let
        // an infrastructure failure leave the appointment denormalised to
        // UNAVAILABLE while the cycle it mirrors stayed untouched — the two
        // would disagree with nothing logged.
        if (!(error instanceof ConfirmationCycleNotFoundError)) throw error;
      }
    }
    await this.appointmentRepo.update(appointmentId, tenantId, {
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
  }
}
