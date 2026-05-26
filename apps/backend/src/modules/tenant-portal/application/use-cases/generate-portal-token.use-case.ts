import type { PrismaClient } from '@prisma/client';
import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { MintPortalTokenService } from '../../domain/mint-portal-token.service';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
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
    /** 028 — optional. When wired, creates an initial confirmation cycle atomically with the token. */
    private readonly cycleService?: ConfirmationCycleService,
    private readonly prisma?: PrismaClient,
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

    let rawToken = '';
    let expiresAt = new Date();

    if (this.cycleService && this.prisma) {
      await this.prisma.$transaction(async (tx) => {
        const minted = await this.mintPortalTokenService.mint(appointment, tenant, tx);
        rawToken = minted.rawToken;
        expiresAt = minted.expiresAt;
        await this.cycleService!.createInitial(
          input.appointmentId,
          appointment.tenantId,
          appointment.scheduledDate,
          appointment.timeSlot,
          minted.tokenId,
          tx,
        );
      });
    } else {
      const minted = await this.mintPortalTokenService.mint(appointment, tenant);
      rawToken = minted.rawToken;
      expiresAt = minted.expiresAt;
    }

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

    // 023 §FR-221 — primary-only dispatch. Without an `isPrimary === true`
    // contact, the portal link has no canonical recipient. We still mint the
    // token (the AM/OP request is auditable as a privileged action), but skip
    // the notification dispatch and return `dispatched: false` so the bulk
    // re-send use case can surface NO_PRIMARY_CONTACT to the operator.
    if (!result.contact || result.contact.isPrimary !== true) {
      this.auditService.log({
        action: 'tenant_portal.dispatch_skipped',
        actorType: 'USER',
        actorId: input.actor.userId,
        entityType: 'appointment',
        entityId: appointment.id,
        tenantId: appointment.tenantId,
        metadata: {
          appointmentId: input.appointmentId,
          reason: 'NO_PRIMARY_CONTACT',
        },
      });
      return {
        token: rawToken,
        expiresAt,
        dispatched: false as const,
        reason: 'NO_PRIMARY_CONTACT' as const,
      };
    }

    // Send portal link notification — fire-and-forget. The token is already persisted;
    // a notification failure must not turn the endpoint into a 500.
    if (this.createNotificationUseCase) {
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
      dispatched: true as const,
    };
  }
}
