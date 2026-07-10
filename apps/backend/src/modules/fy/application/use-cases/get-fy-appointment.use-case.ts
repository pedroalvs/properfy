import type { FyAppointmentDetail } from '@properfy/shared';

import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import type { IRentalTenantPortalTokenRepository } from '../../../rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { ITokenEncrypter } from '../../../rental-tenant-portal/domain/token-encrypter';
import { formatAppointmentCode, type IFyRepository } from '../../domain/fy.repository';

export interface GetFyAppointmentInput {
  appointmentId: string;
}

export class GetFyAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly tokenEncrypter: ITokenEncrypter | null,
    private readonly rentalTenantPortalBaseUrl: string,
    private readonly fyRepo: IFyRepository,
  ) {}

  async execute(input: GetFyAppointmentInput): Promise<FyAppointmentDetail> {
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new AppointmentNotFoundError();
    }
    const { appointment, contact } = result;

    const agency = await this.fyRepo.findAgencyById(appointment.tenantId);
    const confirmationLink = await this.buildConfirmationLink(appointment.id);

    return {
      id: appointment.id,
      code: formatAppointmentCode(
        result.tenantAppointmentCodePrefix ?? null,
        appointment.appointmentNumber,
      ),
      status: appointment.status as FyAppointmentDetail['status'],
      serviceType: { id: appointment.serviceTypeId, name: result.serviceTypeName ?? '' },
      scheduledDate: appointment.scheduledDate.toISOString().slice(0, 10),
      timeSlotStart: appointment.timeSlotStart,
      timeSlotEnd: appointment.timeSlotEnd,
      propertyAddress: result.propertyAddress ?? '',
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      inspector:
        appointment.inspectorId && result.inspectorName
          ? { id: appointment.inspectorId, name: result.inspectorName }
          : null,
      agency: {
        id: appointment.tenantId,
        name: agency?.name ?? result.tenantName ?? '',
        timezone: agency?.timezone ?? 'Australia/Sydney',
      },
      contact: contact
        ? {
            name: contact.effectiveName,
            email: contact.effectiveEmail,
            phone: contact.effectivePhone,
            confirmed: appointment.rentalTenantConfirmationStatus === 'CONFIRMED',
          }
        : null,
      notes: appointment.notes,
      rentalTenantNote: appointment.rentalTenantNote,
      confirmationLink,
    };
  }

  /**
   * The tenant action link (confirm / cancel / reschedule) — the same URL the
   * tenant receives by email/SMS. Expired, missing or undecryptable tokens
   * yield `url: null` so the agent knows to escalate instead of erroring.
   */
  private async buildConfirmationLink(
    appointmentId: string,
  ): Promise<FyAppointmentDetail['confirmationLink']> {
    const token = await this.tokenRepo.findActiveByAppointmentId(appointmentId);
    if (
      !this.tokenEncrypter ||
      !token ||
      !token.rawTokenEncrypted ||
      token.expiresAt.getTime() <= Date.now()
    ) {
      return { url: null, expiresAt: token?.expiresAt.toISOString() ?? null };
    }
    try {
      const rawToken = this.tokenEncrypter.decrypt(token.rawTokenEncrypted);
      const url = new URL(
        '/portal/' + encodeURIComponent(rawToken),
        this.rentalTenantPortalBaseUrl,
      ).toString();
      return { url, expiresAt: token.expiresAt.toISOString() };
    } catch {
      return { url: null, expiresAt: token.expiresAt.toISOString() };
    }
  }
}
