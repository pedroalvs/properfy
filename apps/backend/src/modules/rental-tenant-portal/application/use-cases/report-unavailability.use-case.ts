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
import {
  PortalAppointmentInactiveError,
  PortalInspectionAlreadyStartedError,
  PortalTokenAlreadyUsedError,
} from '../../domain/rental-tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

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

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;

export class ReportUnavailabilityUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly executionRepo?: IInspectionExecutionRepository,
    private readonly domainEventBus?: DomainEventBus,
    private readonly tokenRepo?: IRentalTenantPortalTokenRepository,
    private readonly cycleService?: ConfirmationCycleService,
  ) {}

  async execute(input: ReportUnavailabilityInput) {
    // 1. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 2. Idempotent: already UNAVAILABLE — return success without recording activity
    if (appointment.rentalTenantConfirmationStatus === 'UNAVAILABLE') {
      return {
        rentalTenantConfirmationStatus: 'UNAVAILABLE' as const,
        urgentMode: false,
      };
    }

    // 2b. Block if token has already been used for a mutation
    if (input.isUsed) {
      throw new PortalTokenAlreadyUsedError();
    }

    // 3. Block for inactive appointment statuses
    if (INACTIVE_STATUSES.includes(appointment.status as (typeof INACTIVE_STATUSES)[number])) {
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
      const claimed = await this.tokenRepo.tryClaim(input.tokenId);
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
          await this.tokenRepo.releaseClaim(input.tokenId);
        } catch {
          // release failure leaves the token consumed — fail-closed
        }
      }
      throw error;
    }

    return {
      rentalTenantConfirmationStatus: 'UNAVAILABLE' as const,
      urgentMode: input.isPastConfirmCutoff,
    };
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
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(input.appointmentId);

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
