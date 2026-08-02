import type { PrismaClient } from '@prisma/client';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type {
  AppointmentWithRelations,
  IAppointmentRepository,
} from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { TenantEntity } from '../../../tenant/domain/tenant.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { MintPortalTokenService } from '../../domain/mint-portal-token.service';
import { TOKEN_HASH_COLUMN } from '../../domain/mint-portal-token.service';
import { retryOnUniqueConflict } from '../../../../shared/domain/retry-on-unique-conflict';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import {
  afterCommitResult,
  runInTransaction,
  type AfterCommitResult,
  type TxContext,
} from '../../../../shared/application/unit-of-work';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import {
  PROPERFY_LOGO_URL,
  isRentalTenantNotificationsEnabled,
  TENANT_NOTIFICATIONS_BLOCKED_CODE,
} from '@properfy/shared';

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

export type GeneratePortalTokenOutput =
  | { token: string; expiresAt: Date; dispatched: true; reason?: undefined }
  | {
      token: string;
      expiresAt: Date;
      dispatched: false;
      reason: 'NOTIFY_DISABLED' | 'NO_PRIMARY_CONTACT' | 'DISPATCH_FAILED';
    };

interface PortalTokenGenerationContext {
  result: AppointmentWithRelations;
  tenant: TenantEntity;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;

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

  async execute(input: GeneratePortalTokenInput): Promise<GeneratePortalTokenOutput> {
    const prepare = () =>
      runInTransaction(
        this.cycleService ? this.prisma : undefined,
        (ctx) => this.executeInTransaction(input, ctx),
      );
    const prepared = this.cycleService && this.prisma
      ? await retryOnUniqueConflict(TOKEN_HASH_COLUMN, prepare)
      : await prepare();
    return prepared.runAfterCommit();
  }

  /**
   * Rechecks the current policy in the caller's transaction before a stale
   * confirmation is reset. The full preparation below deliberately rechecks it
   * again after the reset so a setting flip between the two reads rolls back the
   * whole unit rather than leaking a PENDING cycle.
   */
  async assertNotificationPolicyInTransaction(
    input: GeneratePortalTokenInput,
    ctx: TxContext,
  ): Promise<void> {
    await this.loadGenerationContext(input, ctx);
  }

  /**
   * Policy check, token mint and confirmation-cycle link only. Notification
   * creation is represented by the returned handle and must run after commit.
   */
  async executeInTransaction(
    input: GeneratePortalTokenInput,
    ctx: TxContext,
  ): Promise<AfterCommitResult<GeneratePortalTokenOutput>> {
    const { result, tenant } = await this.loadGenerationContext(input, ctx);
    const { appointment } = result;

    let rawToken = '';
    let expiresAt = new Date();

    if (this.cycleService && ctx.tx) {
      const minted = await this.mintPortalTokenService.mint(appointment, tenant, ctx.tx);
      rawToken = minted.rawToken;
      expiresAt = minted.expiresAt;
      await this.cycleService.createInitial(
        input.appointmentId,
        appointment.tenantId,
        appointment.scheduledDate,
        `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
        minted.tokenId,
        ctx.tx,
        ctx.defer,
      );
    } else {
      const minted = await this.mintPortalTokenService.mint(appointment, tenant);
      rawToken = minted.rawToken;
      expiresAt = minted.expiresAt;
    }

    ctx.defer(async () => {
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
    });

    return afterCommitResult(
      () => this.completeAfterCommit(input, result, tenant, rawToken, expiresAt),
    );
  }

  private async loadGenerationContext(
    input: GeneratePortalTokenInput,
    ctx: TxContext,
  ): Promise<PortalTokenGenerationContext> {
    if (!ALLOWED_ROLES.includes(input.actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('FORBIDDEN', 'Only AM, OP or CL_ADMIN roles can generate portal tokens');
    }

    const tenantIdForQuery = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const result = ctx.tx
      ? await this.appointmentRepo.findById(input.appointmentId, tenantIdForQuery, ctx.tx)
      : await this.appointmentRepo.findById(input.appointmentId, tenantIdForQuery);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // Defense in depth: the repo's tenant filter is skipped when the scope is
    // null, so an agency actor that somehow reached here without a tenantId
    // would otherwise mint (and dispatch) a portal credential for any agency.
    // Mirrors the guard in ForceManualTenantConfirmationUseCase.
    if (input.actor.role === 'CL_ADMIN' && appointment.tenantId !== input.actor.tenantId) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    if (!input.allowAnyStatus && !ALLOWED_STATUSES.includes(appointment.status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ConflictError(
        'INVALID_APPOINTMENT_STATUS',
        `Portal link can only be sent for AWAITING_INSPECTOR or SCHEDULED appointments (current: ${appointment.status})`,
      );
    }

    const tenant = ctx.tx
      ? await this.tenantRepo.findById(appointment.tenantId, ctx.tx, true)
      : await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    // Handled here rather than by the SendNotificationUseCase gate on purpose. That gate
    // mirrors AUTOMATIC occupant messages to the agency; this is an operator explicitly
    // asking to notify the rental tenant, so the honest answer is a refusal with a
    // reason, not a silent redirect. Checked before minting so a blocked agency never
    // accumulates unused tokens.
    //
    // `notify: false` is exempt: that path dispatches nothing and exists so the operator
    // can still copy a link for an agency that contacts its own tenants.
    //
    // isRentalTenantNotificationsEnabled tolerates a missing settings blob: tenants
    // persisted before the column had a default carry none, and an unguarded read there
    // is a 500 on every Send Portal Link.
    const notificationsEnabled = isRentalTenantNotificationsEnabled(tenant.settingsJson);
    if (input.notify !== false && !notificationsEnabled) {
      throw new ConflictError(
        TENANT_NOTIFICATIONS_BLOCKED_CODE,
        'Notifications to the tenant are blocked for this agency.',
      );
    }

    return { result, tenant };
  }

  private async completeAfterCommit(
    input: GeneratePortalTokenInput,
    result: AppointmentWithRelations,
    tenant: TenantEntity,
    rawToken: string,
    expiresAt: Date,
  ): Promise<GeneratePortalTokenOutput> {
    const { appointment } = result;

    // Generate-only: the operator asked for a copyable link with no tenant
    // notification. Skip dispatch before any contact checks — the recipient
    // is irrelevant when nothing is sent.
    if (input.notify === false) {
      this.auditService.log({
        action: 'rental_tenant_portal.dispatch_skipped',
        actorType: 'USER',
        actorId: input.actor.userId,
        entityType: 'Appointment',
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
        entityType: 'Appointment',
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
      // The tenant-facing "propose new date" page was removed; this now points
      // at the portal itself. Mirrors BuildNotificationPayloadService.
      const rescheduleLink = confirmationLink;
      const tenantSettings: Record<string, unknown> = tenant.settingsJson ?? {};
      const payloadJson = {
        confirmationLink,
        rescheduleLink,
        scheduledDate: scheduledDateStr,
        rentalTenantName: result.contact.effectiveName,
        propertyAddress: result.propertyAddress ?? '',
        timeSlot: `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
        appointmentCode: new AppointmentCodeFormatter().format(
          appointment.appointmentNumber,
          tenant,
        ),
        agencyName: tenant.name,
        agencyPhone: typeof tenantSettings.contactPhone === 'string' ? tenantSettings.contactPhone : '',
        properfyLogoUrl: PROPERFY_LOGO_URL,
        serviceTypeName: result.serviceTypeName ?? '',
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
