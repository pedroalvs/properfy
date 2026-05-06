import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { MintPortalTokenService } from '../../domain/mint-portal-token.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
  branchId?: string | null;
}

export interface GeneratePortalTokenInput {
  appointmentId: string;
  actor: AuthContext;
}

const ALLOWED_ROLES = ['AM', 'OP'] as const;

export class GeneratePortalTokenUseCase {
  constructor(
    private readonly tokenRepo: ITenantPortalTokenRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly mintPortalTokenService: MintPortalTokenService,
    private readonly auditService: AuditService,
    private readonly createNotificationUseCase?: CreateNotificationUseCase,
  ) {}

  async execute(input: GeneratePortalTokenInput) {
    if (!ALLOWED_ROLES.includes(input.actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP roles can generate portal tokens');
    }

    const tenantIdForQuery = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const result = await this.appointmentRepo.findById(input.appointmentId, tenantIdForQuery);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    const { rawToken, expiresAt } = await this.mintPortalTokenService.mint(appointment, tenant);

    this.auditService.log({
      action: 'tenant_portal.token_generated',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'tenant_portal_token',
      entityId: appointment.id,
      tenantId: appointment.tenantId,
      metadata: {
        appointmentId: input.appointmentId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // Send portal link notification — fire-and-forget. The token is already persisted;
    // a notification failure must not turn the endpoint into a 500.
    if (this.createNotificationUseCase && result.contact) {
      const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0] ?? '';
      const payloadJson = {
        confirmationLink: rawToken,
        rescheduleLink: rawToken,
        scheduledDate: scheduledDateStr,
        tenantName: result.contact.effectiveName,
      };

      const recipientEmail = result.contact.effectiveEmail;
      if (recipientEmail) {
        try {
          await this.createNotificationUseCase.execute({
            tenantId: appointment.tenantId,
            appointmentId: input.appointmentId,
            recipient: recipientEmail,
            channel: 'EMAIL',
            templateCode: 'TENANT_PORTAL_LINK',
            payloadJson,
          });
        } catch {
          // fire-and-forget; token is already saved
        }
      }

      const recipientPhone = result.contact.effectivePhone;
      if (recipientPhone) {
        try {
          await this.createNotificationUseCase.execute({
            tenantId: appointment.tenantId,
            appointmentId: input.appointmentId,
            recipient: recipientPhone,
            channel: 'SMS',
            templateCode: 'TENANT_PORTAL_LINK',
            payloadJson,
          });
        } catch {
          // fire-and-forget; token is already saved
        }
      }
    }

    return {
      token: rawToken,
      expiresAt,
    };
  }
}
