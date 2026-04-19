import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { TokenService } from '../../domain/token.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import { TenantPortalTokenEntity } from '../../domain/tenant-portal-token.entity';
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
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly createNotificationUseCase?: CreateNotificationUseCase,
  ) {}

  async execute(input: GeneratePortalTokenInput) {
    // 1. Validate actor role
    if (!ALLOWED_ROLES.includes(input.actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP roles can generate portal tokens');
    }

    // 2. Load appointment (AM passes null for tenantId to access any tenant)
    const tenantIdForQuery = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const result = await this.appointmentRepo.findById(input.appointmentId, tenantIdForQuery);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 3. Load tenant to get timezone
    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    // 4. Revoke all existing tokens for this appointment
    await this.tokenRepo.revokeAllForAppointment(input.appointmentId);

    // 5. Generate and hash token
    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);

    // 6. Compute expiry based on scheduled date, tenant timezone and cutoff settings
    const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0]!;
    const settings = tenant.settingsJson ?? {};
    const cutoffHour = typeof settings.portalCutoffHour === 'number' ? settings.portalCutoffHour : 19;
    const cutoffDaysBefore = typeof settings.portalCutoffDaysBefore === 'number' ? settings.portalCutoffDaysBefore : 1;
    const expiresAt = this.tokenService.computeExpiresAt(scheduledDateStr, tenant.timezone, cutoffHour, cutoffDaysBefore);

    // 7. Create and save token entity
    const now = new Date();
    const tokenEntity = new TenantPortalTokenEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tokenHash,
      expiresAt,
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.tokenRepo.save(tokenEntity);

    // 8. Audit log
    this.auditService.log({
      action: 'tenant_portal.token_generated',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'tenant_portal_token',
      entityId: tokenEntity.id,
      tenantId: appointment.tenantId,
      metadata: {
        appointmentId: input.appointmentId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // 9. Send portal link notification
    if (this.createNotificationUseCase && result.contact) {
      const payloadJson = {
        portalToken: rawToken,
        scheduledDate: scheduledDateStr,
        tenantName: result.contact.effectiveName,
      };

      // Send EMAIL notification if email available
      const recipientEmail = result.contact.effectiveEmail;
      if (recipientEmail) {
        await this.createNotificationUseCase.execute({
          tenantId: appointment.tenantId,
          appointmentId: input.appointmentId,
          recipient: recipientEmail,
          channel: 'EMAIL',
          templateCode: 'TENANT_PORTAL_LINK',
          payloadJson,
        });
      }

      // Send SMS notification if phone available
      const recipientPhone = result.contact.effectivePhone;
      if (recipientPhone) {
        await this.createNotificationUseCase.execute({
          tenantId: appointment.tenantId,
          appointmentId: input.appointmentId,
          recipient: recipientPhone,
          channel: 'SMS',
          templateCode: 'TENANT_PORTAL_LINK',
          payloadJson,
        });
      }
    }

    // Return shape matches the wire contract (portalTokenResponseSchema):
    // `token` is the unhashed value the client needs to deep-link; the DB
    // holds `tokenHash` only. Bug B-5 (QA 2026-04-18) — this field used to be
    // `rawToken`, which made the Fastify response serializer drop it and
    // surface a 500 on /v1/appointments/:id/portal-token.
    return {
      token: rawToken,
      expiresAt,
    };
  }
}
