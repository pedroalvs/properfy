import type { AuthContext, NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ValidationError } from '../../../../shared/domain/errors';
import { requireTenantScope } from '../../../../shared/domain/require-tenant-scope';

export interface ListConsentsByRecipientInput {
  recipient: string;
  /** The agency to look up. Required for cross-tenant roles (AM/OP); a tenant-pinned role uses its own. */
  tenantId?: string;
  channel?: NotificationChannel;
  actor: AuthContext;
}

export interface ConsentRecordOutput {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
  optedOut: boolean;
  optedOutAt: Date | null;
  changeSource: ConsentChangeSource | null;
  changedAt: Date | null;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListConsentsByRecipientOutput {
  recipient: string;
  entries: ConsentRecordOutput[];
  skippedCount: number;
}

/**
 * Feature 018 US3: operator view of a recipient's consent status.
 *
 * Access (consent records are per agency, so a specific tenant is always resolved):
 *   - AM and OP: cross-tenant (OP role constitution v1.3) — must target an agency by
 *     providing `tenantId` explicitly (any tenant allowed; 400 when missing).
 *   - A tenant-pinned role would be confined to its own tenant, but the route is
 *     AM/OP-only, so CL/INSP/TNT never reach here (403 at the role gate).
 */
export class ListConsentsByRecipientUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListConsentsByRecipientInput): Promise<ListConsentsByRecipientOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'consent.list',
      entityType: 'NotificationConsent',
    });

    if (!input.recipient || !input.recipient.trim()) {
      throw new ValidationError('recipient is required');
    }

    // Resolve the scope the constitutional way: cross-tenant roles (AM/OP) get
    // `undefined` and must name the agency they are inspecting; a tenant-pinned
    // role (not reachable past the AM/OP gate above) is confined to its own.
    const pinnedTenant = requireTenantScope(input.actor, 'consent.list');
    let effectiveTenantId: string;
    if (pinnedTenant !== undefined) {
      effectiveTenantId = pinnedTenant;
    } else {
      if (!input.tenantId) {
        throw new ValidationError('tenantId is required: choose an agency to look up');
      }
      effectiveTenantId = input.tenantId;
    }

    const entries = await this.consentRepo.listByRecipient({
      tenantId: effectiveTenantId,
      recipient: input.recipient,
      channel: input.channel,
    });

    const skippedCount = await this.consentRepo.countSkippedForRecipient({
      tenantId: effectiveTenantId,
      recipient: input.recipient,
    });

    return {
      recipient: input.recipient,
      entries: entries.map((e) => ({
        id: e.id,
        recipient: e.recipient,
        channel: e.channel,
        tenantId: e.tenantId,
        notificationClass: e.notificationClass,
        optedOut: e.optedOut,
        optedOutAt: e.optedOutAt,
        changeSource: e.changeSource,
        changedAt: e.changedAt,
        changedByUserId: e.changedByUserId,
        reason: e.reason,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      skippedCount,
    };
  }
}
