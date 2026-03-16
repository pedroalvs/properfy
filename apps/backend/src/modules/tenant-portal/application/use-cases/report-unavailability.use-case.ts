import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../audit/application/services/persistent-audit.service';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import { PortalAppointmentInactiveError } from '../../domain/tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface ReportUnavailabilityInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  restrictions?: {
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    notes: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
}

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;

export class ReportUnavailabilityUseCase {
  constructor(
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: ReportUnavailabilityInput) {
    // 1. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 2. If read-only: urgent mode
    if (input.isReadOnly) {
      await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
        tenantConfirmationStatus: 'UNAVAILABLE',
      });

      const activity = new TenantPortalActivityEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        tenantPortalTokenId: input.tokenId,
        action: 'UNAVAILABLE_REPORTED',
        previousValuesJson: { tenantConfirmationStatus: appointment.tenantConfirmationStatus },
        newValuesJson: { tenantConfirmationStatus: 'UNAVAILABLE' },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        createdAt: new Date(),
      });
      await this.activityRepo.save(activity);

      this.auditService.log({
        action: 'tenant_portal.unavailability_reported',
        actorType: 'ANONYMOUS',
        entityType: 'appointment',
        entityId: input.appointmentId,
        tenantId: appointment.tenantId,
        before: { tenantConfirmationStatus: appointment.tenantConfirmationStatus },
        after: { tenantConfirmationStatus: 'UNAVAILABLE' },
        ipAddress: input.ipAddress ?? undefined,
        metadata: { urgentMode: true },
      });

      return {
        tenantConfirmationStatus: 'UNAVAILABLE' as const,
        urgentMode: true,
      };
    }

    // 3. Idempotent: already UNAVAILABLE — return success without recording activity
    if (appointment.tenantConfirmationStatus === 'UNAVAILABLE') {
      return {
        tenantConfirmationStatus: 'UNAVAILABLE' as const,
        urgentMode: false,
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

    // 6. Update appointment confirmation status
    await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
      tenantConfirmationStatus: 'UNAVAILABLE',
    });

    // 7. Save restrictions if provided
    if (input.restrictions) {
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(input.appointmentId);

      const restriction = new AppointmentRestrictionEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        isHome: input.restrictions.isHome,
        unavailableDaysJson: input.restrictions.unavailableDaysJson,
        unavailableHoursJson: input.restrictions.unavailableHoursJson,
        notes: input.restrictions.notes,
        source: 'TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 8. Record UNAVAILABLE_REPORTED activity
    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
      action: 'UNAVAILABLE_REPORTED',
      previousValuesJson: previousValues,
      newValuesJson: { tenantConfirmationStatus: 'UNAVAILABLE' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 9. Audit log
    this.auditService.log({
      action: 'tenant_portal.unavailability_reported',
      actorType: 'ANONYMOUS',
      entityType: 'appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: { tenantConfirmationStatus: 'UNAVAILABLE' },
      ipAddress: input.ipAddress ?? undefined,
    });

    return {
      tenantConfirmationStatus: 'UNAVAILABLE' as const,
      urgentMode: false,
    };
  }
}
