import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import { PortalAppointmentInactiveError } from '../../domain/rental-tenant-portal.errors';

export interface GetPortalDataInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  tokenStatus: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export class GetPortalDataUseCase {
  constructor(
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(input: GetPortalDataInput) {
    // 1. Update last accessed timestamp on the token
    await this.tokenRepo.updateLastAccessedAt(input.tokenId, input.appointmentId, new Date());

    // 2. Load appointment with relations (null tenantId — portal has no tenant context)
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new PortalAppointmentInactiveError();
    }

    const { appointment, contact, restrictions } = result;

    // Fetch property details for the portal
    const property = appointment.propertyId
      ? await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId)
      : null;

    // Fetch service type details
    const serviceType = appointment.serviceTypeId
      ? await this.serviceTypeRepo.findById(appointment.serviceTypeId)
      : null;

    // Fetch tenant details for portal display (agency name + timezone)
    const tenant = await this.tenantRepo.findById(appointment.tenantId);

    // 3. Load the latest tenant response recorded on the portal
    const existingResponse = await this.loadExistingResponse(input.tokenId);

    // 4. Record VIEW activity
    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'VIEW',
      previousValuesJson: null,
      newValuesJson: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 5. Return structured portal data
    const isExpired = input.tokenStatus === 'EXPIRED';
    return {
      token: {
        status: input.tokenStatus,
        isReadOnly: input.isReadOnly,
        isExpired,
        canRequestNewLink: isExpired,
        expiresAt: input.expiresAt,
      },
      appointment: {
        id: appointment.id,
        status: appointment.status,
        scheduledDate: appointment.scheduledDate,
        timeSlotStart: appointment.timeSlotStart,
        timeSlotEnd: appointment.timeSlotEnd,
        rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
        keyRequired: appointment.keyRequired,
        meetingLocation: appointment.meetingLocation,
        notes: appointment.notes,
        serviceType: serviceType
          ? {
              id: serviceType.id,
              name: serviceType.name,
              code: serviceType.code,
            }
          : null,
        property: property
          ? {
              id: property.id,
              propertyCode: property.propertyCode,
              type: property.type,
              street: property.street,
              addressLine2: property.addressLine2,
              suburb: property.suburb,
              postcode: property.postcode,
              state: property.state,
              country: property.country,
            }
          : null,
      },
      contact: contact
        ? {
            rentalTenantName: contact.effectiveName,
            primaryEmail: contact.effectiveEmail,
            primaryPhone: contact.effectivePhone,
          }
        : null,
      restrictions: restrictions[0]
        ? {
            isHome: restrictions[0].isHome,
            unavailableDaysJson: restrictions[0].unavailableDaysJson,
            unavailableHoursJson: restrictions[0].unavailableHoursJson,
            notes: restrictions[0].notes,
            source: restrictions[0].source,
          }
        : null,
      existingResponse,
      rescheduleAllowed: serviceType?.flowType === 'ROUTINE',
      tenant: {
        name: tenant?.name ?? null,
        timezone: tenant?.timezone ?? 'Australia/Sydney',
      },
    };
  }

  private async loadExistingResponse(tokenId: string) {
    const [confirm, reschedule, unavailable] = await Promise.all([
      this.activityRepo.findLatestByTokenAndAction(tokenId, 'CONFIRM'),
      this.activityRepo.findLatestByTokenAndAction(tokenId, 'RESCHEDULE'),
      this.activityRepo.findLatestByTokenAndAction(tokenId, 'UNAVAILABLE_REPORTED'),
    ]);

    const latest = [confirm, reschedule, unavailable]
      .filter((activity): activity is NonNullable<typeof activity> => !!activity)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!latest) {
      return undefined;
    }

    switch (latest.action) {
      case 'CONFIRM':
        return {
          type: 'CONFIRMED',
          createdAt: latest.createdAt.toISOString(),
          summary: 'Tenant confirmed attendance',
        };
      case 'RESCHEDULE':
        return {
          type: 'RESCHEDULE',
          createdAt: latest.createdAt.toISOString(),
          summary: this.buildRescheduleSummary(latest.newValuesJson),
        };
      case 'UNAVAILABLE_REPORTED':
        return {
          type: 'UNAVAILABLE',
          createdAt: latest.createdAt.toISOString(),
          summary: 'Tenant reported unavailability',
        };
      default:
        return undefined;
    }
  }

  private buildRescheduleSummary(newValuesJson: Record<string, unknown> | null): string {
    const scheduledDate = typeof newValuesJson?.['scheduledDate'] === 'string'
      ? newValuesJson['scheduledDate']
      : null;
    const timeSlot = typeof newValuesJson?.['timeSlot'] === 'string'
      ? newValuesJson['timeSlot']
      : null;

    if (scheduledDate && timeSlot) {
      return `Tenant requested reschedule to ${scheduledDate} ${timeSlot}`;
    }

    return 'Tenant requested reschedule';
  }
}
