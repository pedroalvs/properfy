import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { ITenantPortalTokenRepository } from '../../../tenant-portal/domain/tenant-portal-token.repository';
import type { ITokenEncrypter } from '../../../tenant-portal/domain/token-encrypter';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';
import { ConfirmationCycleNotFoundError, PortalTokenNotDecryptableError } from '../../domain/confirmation-cycle.errors';

export interface GetPortalLinkInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface GetPortalLinkOutput {
  portalUrl: string;
  expiresAt: string;
}

export class GetPortalLinkUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tokenRepo: ITenantPortalTokenRepository,
    private readonly tokenEncrypter: ITokenEncrypter,
    private readonly tenantPortalBaseUrl: string,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetPortalLinkInput): Promise<GetPortalLinkOutput> {
    const { appointmentId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'appointment.portal_link', entityType: 'Appointment' });

    const tenantScope = actor.role === 'AM' ? null : actor.tenantId;
    const result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    if (!result) {
      throw new AppointmentNotFoundError();
    }

    const { appointment } = result;

    if (!appointment.activeConfirmationCycleId) {
      throw new ConfirmationCycleNotFoundError();
    }

    const token = await this.tokenRepo.findActiveByAppointmentId(appointmentId);
    if (!token || !token.rawTokenEncrypted) {
      throw new ConfirmationCycleNotFoundError();
    }

    let rawToken: string;
    try {
      rawToken = this.tokenEncrypter.decrypt(token.rawTokenEncrypted);
    } catch {
      throw new PortalTokenNotDecryptableError();
    }

    const portalUrl = new URL('/portal/' + encodeURIComponent(rawToken), this.tenantPortalBaseUrl).toString();

    return {
      portalUrl,
      expiresAt: token.expiresAt.toISOString(),
    };
  }
}
