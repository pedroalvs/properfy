import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IInspectionExecutionRepository } from '../../../inspector-execution/domain/inspection-execution.repository';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { AvailableSlot } from '@properfy/shared';
import {
  PortalAppointmentInactiveError,
  PortalInspectionAlreadyStartedError,
  PortalTokenAlreadyUsedError,
} from '../../domain/tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface ReportUnavailabilityInput {
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

export class ReportUnavailabilityUseCase {
  constructor(
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly executionRepo?: IInspectionExecutionRepository,
    private readonly domainEventBus?: DomainEventBus,
    private readonly tokenRepo?: ITenantPortalTokenRepository,
  ) {}

  async execute(input: ReportUnavailabilityInput) {
    // 1. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 2. Idempotent: already UNAVAILABLE — return success without recording activity
    if (appointment.tenantConfirmationStatus === 'UNAVAILABLE') {
      return {
        tenantConfirmationStatus: 'UNAVAILABLE' as const,
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

    // 4. Snapshot previous values
    const previousValues = {
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    };

    // 5. Update appointment confirmation status (and tenant note if provided)
    await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
      tenantConfirmationStatus: 'UNAVAILABLE',
      ...(input.tenantNote !== undefined ? { tenantNote: input.tenantNote } : {}),
    });

    // 5b. Mark token as used (replay detection)
    if (this.tokenRepo) {
      await this.tokenRepo.markUsed(input.tokenId);
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
        source: 'TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 7. Record UNAVAILABLE_REPORTED activity — include availableSlotsJson when present (M6)
    const newValuesJson: Record<string, unknown> = { tenantConfirmationStatus: 'UNAVAILABLE' };
    if (input.restrictions?.availableSlotsJson) {
      newValuesJson['availableSlotsJson'] = input.restrictions.availableSlotsJson;
    }

    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
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
      action: 'tenant_portal.unavailability_reported',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: { tenantConfirmationStatus: 'UNAVAILABLE' },
      metadata: {
        origin: 'tenant_portal',
        urgentMode: input.isReadOnly,
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

    return {
      tenantConfirmationStatus: 'UNAVAILABLE' as const,
      urgentMode: input.isReadOnly,
    };
  }
}
