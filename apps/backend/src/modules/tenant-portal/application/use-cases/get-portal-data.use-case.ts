import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import { PortalAppointmentInactiveError } from '../../domain/tenant-portal.errors';

export interface GetPortalDataInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  tokenStatus: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export class GetPortalDataUseCase {
  constructor(
    private readonly tokenRepo: ITenantPortalTokenRepository,
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: GetPortalDataInput) {
    // 1. Update last accessed timestamp on the token
    await this.tokenRepo.updateLastAccessedAt(input.tokenId, new Date());

    // 2. Load appointment with relations (null tenantId — portal has no tenant context)
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new PortalAppointmentInactiveError();
    }

    const { appointment, contact, restrictions } = result;

    // 3. Record VIEW activity
    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
      action: 'VIEW',
      previousValuesJson: null,
      newValuesJson: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 4. Return structured portal data
    return {
      token: {
        status: input.tokenStatus,
        isReadOnly: input.isReadOnly,
      },
      appointment: {
        id: appointment.id,
        status: appointment.status,
        scheduledDate: appointment.scheduledDate,
        timeSlot: appointment.timeSlot,
        serviceTypeId: appointment.serviceTypeId,
        tenantConfirmationStatus: appointment.tenantConfirmationStatus,
        keyRequired: appointment.keyRequired,
        meetingLocation: appointment.meetingLocation,
        notes: appointment.notes,
      },
      contact: contact
        ? {
            tenantName: contact.tenantName,
            primaryEmail: contact.primaryEmail,
            secondaryEmail: contact.secondaryEmail,
            primaryPhone: contact.primaryPhone,
            secondaryPhone: contact.secondaryPhone,
          }
        : null,
      restrictions:
        restrictions.length > 0
          ? {
              isHome: restrictions[0].isHome,
              unavailableDaysJson: restrictions[0].unavailableDaysJson,
              unavailableHoursJson: restrictions[0].unavailableHoursJson,
              notes: restrictions[0].notes,
              source: restrictions[0].source,
            }
          : null,
    };
  }
}
