import { createHash } from 'node:crypto';
import type { AuthContext, AvailableSlot } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import {
  AppointmentNotFoundError,
  AppointmentInvalidTransitionError,
  RentalTenantAvailabilityIdempotencyKeyRequiredError,
  RentalTenantAvailabilityIdempotencyPayloadMismatchError,
  RentalTenantAvailabilityIdempotencyInProgressError,
} from '../../domain/appointment.errors';
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
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';

interface IStatusTransitionUseCase {
  execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput>;
}

/** Mirrors the wording the portal decline records, so the audit trail reads alike. */
const REJECTION_REASON = 'Rental tenant reported they cannot attend, recorded by the operator';
const IDEMPOTENCY_SCOPE = 'rental-tenant-availability';
const IDEMPOTENCY_TTL_HOURS = 24;
const IDEMPOTENCY_ACQUIRE_TTL_HOURS = 5 / 60;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function orderSlots(slots: AvailableSlot[]): AvailableSlot[] {
  return [...slots].sort((a, b) =>
    a.dayOfWeek.localeCompare(b.dayOfWeek)
    || a.start.localeCompare(b.start)
    || a.end.localeCompare(b.end));
}

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
    private readonly idempotencyService: IIdempotencyService,
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
      if (!idempotencyKey) {
        throw new RentalTenantAvailabilityIdempotencyKeyRequiredError();
      }
    }

    const idempotency = markUnavailable && idempotencyKey
      ? this.buildIdempotencyContext(input, idempotencyKey)
      : null;
    let idempotencyOwnerToken: string | null = null;
    if (idempotency) {
      const claim = await this.idempotencyService.tryAcquire<SetRentalTenantAvailabilityOutput>(
        idempotency.commandKey,
        IDEMPOTENCY_SCOPE,
        idempotency.payloadHash,
        IDEMPOTENCY_ACQUIRE_TTL_HOURS,
      );
      if (claim.status !== 'acquired' && claim.payloadHash !== idempotency.payloadHash) {
        throw new RentalTenantAvailabilityIdempotencyPayloadMismatchError();
      }
      if (claim.status === 'completed') return claim.response;
      if (claim.status === 'in_progress') {
        throw new RentalTenantAvailabilityIdempotencyInProgressError();
      }
      idempotencyOwnerToken = claim.ownerToken;
    }

    // AM/OP are platform-wide; CL_ADMIN is pinned to their JWT tenant.
    const tenantScope = actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;
    let result: Awaited<ReturnType<IAppointmentRepository['findById']>>;
    try {
      result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    } catch (error) {
      if (idempotency && idempotencyOwnerToken) await this.releaseClaim(idempotency, idempotencyOwnerToken);
      throw error;
    }
    if (!result) {
      if (idempotency && idempotencyOwnerToken) await this.releaseClaim(idempotency, idempotencyOwnerToken);
      throw new AppointmentNotFoundError();
    }

    const { appointment } = result;
    // Defense in depth: the actor must own the row even if the repo ever
    // loosens its tenant filter.
    if (actor.role === 'CL_ADMIN' && appointment.tenantId !== actor.tenantId) {
      if (idempotency && idempotencyOwnerToken) await this.releaseClaim(idempotency, idempotencyOwnerToken);
      throw new AppointmentNotFoundError();
    }

    const previous = result.restrictions ?? [];
    const existing = previous.find((r) => r.availableSlotsJson?.length) ?? previous[0] ?? null;

    // Declining an appointment the "will you be home?" question no longer
    // applies to would try to reject it twice. Recording availability alone is
    // still fine on a terminal appointment — it is just data.
    if (markUnavailable && isPortalUnanswerableStatus(appointment.status)) {
      // An expired reservation can be reacquired after the business writes were
      // already committed. Rebuild the command result without re-driving the
      // transition or its notifications.
      if (
        appointment.status === 'REJECTED'
        && appointment.rentalTenantConfirmationStatus === 'UNAVAILABLE'
        && idempotency
        && this.sameSlots(existing?.availableSlotsJson ?? [], availableSlots)
      ) {
        const recovered = this.output(appointmentId, availableSlots, 'UNAVAILABLE');
        if (idempotencyOwnerToken) {
          await this.cacheResult(idempotency, idempotencyOwnerToken, recovered);
        }
        return recovered;
      }
      if (idempotency && idempotencyOwnerToken) await this.releaseClaim(idempotency, idempotencyOwnerToken);
      throw new AppointmentInvalidTransitionError(appointment.status, 'REJECTED');
    }

    // At most one row exists and `replaceRestrictions` overwrites it wholesale,
    // so the operator's own fields have to ride along or they are destroyed.
    // Prefer the row that already carries slots; fall back to whatever single
    // row is there.
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
    let commandAuditLogged = false;
    try {
      if (idempotency && idempotencyOwnerToken) {
        await this.renewClaim(idempotency, idempotencyOwnerToken);
      }
      await this.appointmentRepo.replaceRestrictions(appointmentId, restriction);

      let confirmationStatus = appointment.rentalTenantConfirmationStatus;
      if (markUnavailable) {
        confirmationStatus = 'UNAVAILABLE';
        if (idempotency && idempotencyOwnerToken) {
          await this.renewClaim(idempotency, idempotencyOwnerToken);
        }
        await this.markTenantUnavailable(appointmentId, appointment.tenantId);
        // The appointment ends here: nobody can let the inspector in, so it leaves
        // the run and waits to be rescheduled against the availability just saved.
        // Attributed to the operator who did it, unlike the portal's SYS actor.
        if (idempotency && idempotencyOwnerToken) {
          await this.renewClaim(idempotency, idempotencyOwnerToken);
        }
        await this.statusTransition.execute(
          this.transitionInput(input, idempotency?.transitionKey),
        );
      }

      this.logCommandAudit(input, appointment.tenantId, existing, appointment.rentalTenantConfirmationStatus, confirmationStatus);
      commandAuditLogged = true;

      const output = this.output(appointmentId, availableSlots, confirmationStatus);
      if (idempotency && idempotencyOwnerToken) {
        await this.cacheResult(idempotency, idempotencyOwnerToken, output);
      }
      return output;
    } catch (error) {
      if (idempotency && markUnavailable) {
        let recovered: SetRentalTenantAvailabilityOutput | null = null;
        try {
          recovered = await this.recoverCompletedDecline(
            input,
            tenantScope,
            idempotency,
            idempotencyOwnerToken,
          );
        } catch {
          // Recovery is best-effort; preserve the original command failure.
        }
        if (recovered) {
          if (!commandAuditLogged) {
            this.logCommandAudit(input, appointment.tenantId, existing, appointment.rentalTenantConfirmationStatus, 'UNAVAILABLE');
          }
          return recovered;
        }
      }
      if (idempotency && idempotencyOwnerToken) {
        await this.releaseClaim(idempotency, idempotencyOwnerToken);
      }
      throw error;
    }
  }

  private buildIdempotencyContext(input: SetRentalTenantAvailabilityInput, key: string) {
    const principal = `${input.actor.tenantId ?? 'platform'}:${input.actor.userId}`;
    const keyHash = sha256(`${principal}:${key}`);
    const payloadHash = sha256(JSON.stringify({
      appointmentId: input.appointmentId,
      availableSlots: orderSlots(input.availableSlots),
      markUnavailable: input.markUnavailable,
      actor: {
        userId: input.actor.userId,
        tenantId: input.actor.tenantId,
        role: input.actor.role,
      },
    }));
    return {
      commandKey: `rental-tenant-availability:${keyHash}`,
      transitionKey: `rental-tenant-availability-transition:${keyHash}`,
      payloadHash,
    };
  }

  private transitionInput(
    input: SetRentalTenantAvailabilityInput,
    idempotencyKey?: string,
  ): ExecuteStatusTransitionInput {
    return {
      appointmentId: input.appointmentId,
      targetStatus: 'REJECTED',
      reason: REJECTION_REASON,
      rejectionReasonCode: 'TENANT_DECLINED',
      ...(idempotencyKey ? { idempotencyKey } : {}),
      actor: input.actor,
    };
  }

  private sameSlots(left: AvailableSlot[], right: AvailableSlot[]): boolean {
    return JSON.stringify(orderSlots(left)) === JSON.stringify(orderSlots(right));
  }

  private output(
    id: string,
    availableSlots: AvailableSlot[],
    rentalTenantConfirmationStatus: string,
  ): SetRentalTenantAvailabilityOutput {
    return { id, availableSlots, rentalTenantConfirmationStatus };
  }

  private async cacheResult(
    context: { commandKey: string; payloadHash: string },
    ownerToken: string,
    output: SetRentalTenantAvailabilityOutput,
  ): Promise<void> {
    const completed = await this.idempotencyService.complete(
      context.commandKey,
      IDEMPOTENCY_SCOPE,
      ownerToken,
      output,
      IDEMPOTENCY_TTL_HOURS,
      context.payloadHash,
    );
    if (!completed) throw new RentalTenantAvailabilityIdempotencyInProgressError();
  }

  private async releaseClaim(
    context: { commandKey: string; payloadHash: string },
    ownerToken: string,
  ): Promise<void> {
    try {
      await this.idempotencyService.release(
        context.commandKey,
        IDEMPOTENCY_SCOPE,
        context.payloadHash,
        ownerToken,
      );
    } catch {
      // Keep the original business error; the short reservation expires in five minutes.
    }
  }

  private async renewClaim(
    context: { commandKey: string; payloadHash: string },
    ownerToken: string,
  ): Promise<void> {
    const renewed = await this.idempotencyService.renew(
      context.commandKey,
      IDEMPOTENCY_SCOPE,
      context.payloadHash,
      ownerToken,
      IDEMPOTENCY_ACQUIRE_TTL_HOURS,
    );
    if (!renewed) throw new RentalTenantAvailabilityIdempotencyInProgressError();
  }

  private async recoverCompletedDecline(
    input: SetRentalTenantAvailabilityInput,
    tenantScope: string | null,
    context: { commandKey: string; payloadHash: string },
    ownerToken: string | null,
  ): Promise<SetRentalTenantAvailabilityOutput | null> {
    const latest = await this.appointmentRepo.findById(input.appointmentId, tenantScope);
    const restriction = latest?.restrictions.find((item) => item.availableSlotsJson?.length);
    if (
      !latest
      || latest.appointment.status !== 'REJECTED'
      || latest.appointment.rentalTenantConfirmationStatus !== 'UNAVAILABLE'
      || !this.sameSlots(restriction?.availableSlotsJson ?? [], input.availableSlots)
    ) {
      return null;
    }

    const recovered = this.output(input.appointmentId, input.availableSlots, 'UNAVAILABLE');
    try {
      if (ownerToken) await this.cacheResult(context, ownerToken, recovered);
    } catch {
      // The business state is authoritative; a cache outage must not turn a
      // completed destructive command into a client-visible failure.
    }
    return recovered;
  }

  private logCommandAudit(
    input: SetRentalTenantAvailabilityInput,
    tenantId: string,
    existing: AppointmentRestrictionEntity | null,
    previousConfirmationStatus: string,
    confirmationStatus: string,
  ): void {
    this.auditService.log({
      action: 'appointment.rental_tenant_availability_set',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId,
      before: {
        availableSlotsJson: existing?.availableSlotsJson ?? null,
        rentalTenantConfirmationStatus: previousConfirmationStatus,
      },
      after: {
        availableSlotsJson: input.availableSlots,
        rentalTenantConfirmationStatus: confirmationStatus,
      },
      metadata: { markUnavailable: input.markUnavailable },
    });
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
