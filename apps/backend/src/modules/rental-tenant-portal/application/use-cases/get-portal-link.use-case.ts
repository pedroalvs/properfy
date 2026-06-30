import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { ITokenEncrypter } from '../../domain/token-encrypter';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import { PortalTokenNotDecryptableError } from '../../../appointment/domain/confirmation-cycle.errors';
import { NoActivePortalTokenError } from '../../domain/rental-tenant-portal.errors';

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
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly tokenEncrypter: ITokenEncrypter,
    private readonly rentalTenantPortalBaseUrl: string,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
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

    // AC-2.6: findActiveByAppointmentId is the sole authority.
    // The previous cycle-proxy early-reject was removed — a null activeConfirmationCycleId
    // does not mean there is no active token (legacy / bypassed paths may mint tokens directly).
    const token = await this.tokenRepo.findActiveByAppointmentId(appointmentId);
    if (!token) {
      throw new NoActivePortalTokenError();
    }

    if (!token.rawTokenEncrypted) {
      throw new PortalTokenNotDecryptableError();
    }

    let rawToken: string;
    try {
      rawToken = this.tokenEncrypter.decrypt(token.rawTokenEncrypted);
    } catch {
      throw new PortalTokenNotDecryptableError();
    }

    const portalUrl = new URL('/rental-tenant-portal/' + encodeURIComponent(rawToken), this.rentalTenantPortalBaseUrl).toString();

    this.auditService.log({
      action: 'rental_tenant_portal.link_copied',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: { tokenId: token.id, expiresAt: token.expiresAt.toISOString() },
    });

    return {
      portalUrl,
      expiresAt: token.expiresAt.toISOString(),
    };
  }
}
