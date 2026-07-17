import type { AvailableSlot } from '@properfy/shared';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalTokenAlreadyUsedError,
} from '../../domain/rental-tenant-portal.errors';

export interface ConfirmAppointmentInput {
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

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;

export class ConfirmAppointmentUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly domainEventBus?: DomainEventBus,
    private readonly tokenRepo?: IRentalTenantPortalTokenRepository,
    private readonly cycleService?: ConfirmationCycleService,
  ) {}

  async execute(input: ConfirmAppointmentInput) {
    // 1. Block if token is read-only (expired)
    if (input.isReadOnly) {
      throw new PortalActionBlockedError();
    }

    // 1b. Block if token has already been used for a mutation
    if (input.isUsed) {
      throw new PortalTokenAlreadyUsedError();
    }

    // 2. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new PortalAppointmentInactiveError();
    }

    const { appointment } = result;

    // 3. Block for inactive appointment statuses FIRST — a cancelled appointment must
    // never confirm, not even through the idempotent path below (residual CONFIRMED).
    if (INACTIVE_STATUSES.includes(appointment.status as (typeof INACTIVE_STATUSES)[number])) {
      throw new PortalAppointmentInactiveError();
    }

    // 4. Idempotent: already confirmed — return success without recording activity
    if (appointment.rentalTenantConfirmationStatus === 'CONFIRMED') {
      return {
        rentalTenantConfirmationStatus: 'CONFIRMED' as const,
        confirmedAt: new Date().toISOString(),
      };
    }

    // 4b. Confirmation window closed (T-1 cutoff). The token itself is still valid —
    // unavailability/reschedule/group-change remain available past the cutoff.
    if (input.isPastConfirmCutoff) {
      throw new PortalActionBlockedError();
    }

    // 5. Snapshot previous values
    const previousValues = {
      rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
    };

    // 6. Update appointment confirmation status via cycle service (if wired)
    if (this.cycleService) {
      try {
        await this.cycleService.confirm(input.appointmentId, appointment.tenantId, 'RENTAL_TENANT_PORTAL', input.tokenId ?? null);
      } catch {
        // No active cycle (pre-feature appointment) — fall back to direct denorm write
        await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
          rentalTenantConfirmationStatus: 'CONFIRMED',
        });
      }
      if (input.rentalTenantNote !== undefined) {
        await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
          rentalTenantNote: input.rentalTenantNote,
        });
      }
    } else {
      const payload: Record<string, unknown> = { rentalTenantConfirmationStatus: 'CONFIRMED' };
      if (input.rentalTenantNote !== undefined) payload.rentalTenantNote = input.rentalTenantNote;
      await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, payload);
    }

    // 7. Confirm resets stale rental-tenant-portal restrictions from previous unavailability/reschedule cycles.
    await this.appointmentRepo.deleteRestrictionsByAppointmentId(input.appointmentId);

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
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 7b. Mark token as used (replay detection)
    if (this.tokenRepo) {
      await this.tokenRepo.markUsed(input.tokenId);
    }

    // 8. Record CONFIRM activity
    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'CONFIRM',
      previousValuesJson: previousValues,
      newValuesJson: { rentalTenantConfirmationStatus: 'CONFIRMED' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 9. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.appointment_confirmed',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: { rentalTenantConfirmationStatus: 'CONFIRMED' },
      ipAddress: input.ipAddress ?? undefined,
    });

    // 10. Side effect: notification on confirmation
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({ appointmentId: input.appointmentId, tenantId: appointment.tenantId, action: 'CONFIRM' });
      } catch {
        // fire-and-forget — notification failure must not affect the confirmation
      }
    }

    // 11. Emit domain event
    if (this.domainEventBus) {
      await this.domainEventBus.emit({
        type: TENANT_PORTAL_EVENTS.CONFIRMED,
        payload: {
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          tokenId: input.tokenId,
        },
        occurredAt: new Date(),
      });
    }

    return {
      rentalTenantConfirmationStatus: 'CONFIRMED' as const,
      confirmedAt: new Date().toISOString(),
    };
  }
}
