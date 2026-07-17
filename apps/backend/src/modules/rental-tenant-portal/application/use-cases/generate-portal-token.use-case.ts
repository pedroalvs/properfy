import type { PrismaClient } from '@prisma/client';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { MintPortalTokenService } from '../../domain/mint-portal-token.service';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
  branchId?: string | null;
}

export interface GeneratePortalTokenInput {
  appointmentId: string;
  actor: AuthContext;
  /**
   * GAP-004: the portal reschedule flow reopens the appointment to DRAFT and
   * re-issues a fresh token for the new date. Internal callers set this to
   * bypass the operator-facing status gate; HTTP routes must never set it.
   */
  allowAnyStatus?: boolean;
  /**
   * When false, mint the token without dispatching any notification —
   * the operator copies the link manually. Defaults to true.
   */
  notify?: boolean;
}

const ALLOWED_ROLES = ['AM', 'OP'] as const;

// Portal link is only meaningful once the appointment leaves DRAFT and is not
// terminal: the tenant confirms/reschedules a released, non-finished visit.
const ALLOWED_STATUSES = ['AWAITING_INSPECTOR', 'SCHEDULED'] as const;

export class GeneratePortalTokenUseCase {
  constructor(
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly mintPortalTokenService: MintPortalTokenService,
    private readonly auditService: AuditService,
    /** Tenant-portal SPA base URL used to build confirmationLink / rescheduleLink. */
    private readonly rentalTenantPortalBaseUrl: string,
    private readonly createNotificationUseCase?: CreateNotificationUseCase,
    /** 028 — optional. When wired, creates an initial confirmation cycle atomically with the token. */
    private readonly cycleService?: ConfirmationCycleService,
    private readonly prisma?: PrismaClient,
    private readonly logger?: Logger,
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

    if (!input.allowAnyStatus && !ALLOWED_STATUSES.includes(appointment.status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ConflictError(
        'INVALID_APPOINTMENT_STATUS',
        `Portal link can only be sent for AWAITING_INSPECTOR or SCHEDULED appointments (current: ${appointment.status})`,
      );
    }

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
          `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
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
      action: 'rental_tenant_portal.token_generated',
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

    // Generate-only: the operator asked for a copyable link with no tenant
    // notification. Skip dispatch before any contact checks — the recipient
    // is irrelevant when nothing is sent.
    if (input.notify === false) {
      this.auditService.log({
        action: 'rental_tenant_portal.dispatch_skipped',
        actorType: 'USER',
        actorId: input.actor.userId,
        entityType: 'appointment',
        entityId: appointment.id,
        tenantId: appointment.tenantId,
        metadata: {
          appointmentId: input.appointmentId,
          reason: 'NOTIFY_DISABLED',
        },
      });
      return {
        token: rawToken,
        expiresAt,
        dispatched: false as const,
        reason: 'NOTIFY_DISABLED' as const,
      };
    }

    // 023 §FR-221 — primary-only dispatch. Without an `isPrimary === true`
    // contact, the portal link has no canonical recipient. We still mint the
    // token (the AM/OP request is auditable as a privileged action), but skip
    // the notification dispatch and return `dispatched: false` so the bulk
    // re-send use case can surface NO_PRIMARY_CONTACT to the operator.
    if (!result.contact || result.contact.isPrimary !== true) {
      this.auditService.log({
        action: 'rental_tenant_portal.dispatch_skipped',
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
    // a notification failure must not turn the endpoint into a 500, but the
    // caller must know nothing went out (the UI used to claim "Email sent").
    let attemptedDispatches = 0;
    let succeededDispatches = 0;
    if (this.createNotificationUseCase) {
      const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0] ?? '';
      // Build full portal URLs (not the bare token) so the email/SMS contains a
      // clickable link. Mirrors BuildNotificationPayloadService (automated path).
      const confirmationLink = new URL(
        '/portal/' + encodeURIComponent(rawToken),
        this.rentalTenantPortalBaseUrl,
      ).toString();
      const rescheduleLink = new URL(
        '/portal/' + encodeURIComponent(rawToken) + '/reschedule',
        this.rentalTenantPortalBaseUrl,
      ).toString();
      const payloadJson = {
        confirmationLink,
        rescheduleLink,
        scheduledDate: scheduledDateStr,
        rentalTenantName: result.contact.effectiveName,
      };

      const recipientEmail = result.contact.effectiveEmail;
      if (recipientEmail) {
        attemptedDispatches += 1;
        try {
          await this.createNotificationUseCase.execute({
            tenantId: appointment.tenantId,
            appointmentId: input.appointmentId,
            recipient: recipientEmail,
            channel: 'EMAIL',
            templateCode: 'TENANT_PORTAL_LINK',
            payloadJson,
          });
          succeededDispatches += 1;
        } catch (notificationDispatchError) {
          // fire-and-forget; token is already saved — failure must not turn the endpoint into a 500.
          // Log the error so dispatch failures are observable (Regras invariant A.2).
          this.logger?.error(
            { notificationDispatchError, appointmentId: input.appointmentId, tenantId: appointment.tenantId, channel: 'EMAIL', recipient: recipientEmail },
            'rental_tenant_portal.notification_dispatch_failed',
          );
        }
      }

      const recipientPhone = result.contact.effectivePhone;
      if (recipientPhone) {
        attemptedDispatches += 1;
        try {
          await this.createNotificationUseCase.execute({
            tenantId: appointment.tenantId,
            appointmentId: input.appointmentId,
            recipient: recipientPhone,
            channel: 'SMS',
            templateCode: 'TENANT_PORTAL_LINK',
            payloadJson,
          });
          succeededDispatches += 1;
        } catch (notificationDispatchError) {
          // fire-and-forget; token is already saved — failure must not turn the endpoint into a 500.
          // Log the error so dispatch failures are observable (Regras invariant A.2).
          this.logger?.error(
            { notificationDispatchError, appointmentId: input.appointmentId, tenantId: appointment.tenantId, channel: 'SMS', recipient: recipientPhone },
            'rental_tenant_portal.notification_dispatch_failed',
          );
        }
      }
    }

    if (attemptedDispatches > 0 && succeededDispatches === 0) {
      return {
        token: rawToken,
        expiresAt,
        dispatched: false as const,
        reason: 'DISPATCH_FAILED' as const,
      };
    }

    return {
      token: rawToken,
      expiresAt,
      dispatched: true as const,
    };
  }
}
