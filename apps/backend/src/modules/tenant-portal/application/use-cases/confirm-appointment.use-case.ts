import type { AvailableSlot } from '@properfy/shared';
import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalTokenAlreadyUsedError,
} from '../../domain/tenant-portal.errors';

export interface ConfirmAppointmentInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  isUsed: boolean;
  restrictions?: {
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    availableSlotsJson?: AvailableSlot[] | null;
    notes: string | null;
  };
  tenantNote?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;

export class ConfirmAppointmentUseCase {
  constructor(
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly domainEventBus?: DomainEventBus,
    private readonly tokenRepo?: ITenantPortalTokenRepository,
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

    // 3. Idempotent: already confirmed — return success without recording activity
    if (appointment.tenantConfirmationStatus === 'CONFIRMED') {
      return {
        tenantConfirmationStatus: 'CONFIRMED' as const,
        confirmedAt: new Date().toISOString(),
      };
    }

    // 4. Block for inactive appointment statuses
    if (INACTIVE_STATUSES.includes(appointment.status as (typeof INACTIVE_STATUSES)[number])) {
      throw new PortalAppointmentInactiveError();
    }

    // 5. Snapshot previous values
    const previousValues = {
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    };

    // 6. Update appointment confirmation status (and tenant note if provided)
    await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
      tenantConfirmationStatus: 'CONFIRMED',
      ...(input.tenantNote !== undefined ? { tenantNote: input.tenantNote } : {}),
    });

    // 7. Confirm resets stale tenant-portal restrictions from previous unavailability/reschedule cycles.
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
        source: 'TENANT_PORTAL',
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
    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
      action: 'CONFIRM',
      previousValuesJson: previousValues,
      newValuesJson: { tenantConfirmationStatus: 'CONFIRMED' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 9. Audit log
    this.auditService.log({
      action: 'tenant_portal.appointment_confirmed',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: { tenantConfirmationStatus: 'CONFIRMED' },
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
      tenantConfirmationStatus: 'CONFIRMED' as const,
      confirmedAt: new Date().toISOString(),
    };
  }
}
