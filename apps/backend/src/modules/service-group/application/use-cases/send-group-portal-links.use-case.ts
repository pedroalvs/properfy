import type { AuthContext, SendGroupPortalLinksResultItem } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { GeneratePortalTokenUseCase } from '../../../tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { classifyPortalLinkAction } from '../../../appointment/domain/portal-link-eligibility';
import { dayKeyInTz } from '../../../appointment/application/use-cases/bulk-action-shared';

// EXACT reuse of the bulk-resend idempotency bucket: a same-day reminder already
// sent (from the map bulk flow or a prior group click) is a no-op here too —
// both dispatch the identical TENANT_PORTAL_LINK notification.
const IDEMPOTENCY_SCOPE = 'bulk_resend_reminder';
const IDEMPOTENCY_TTL_HOURS = 36;
const ERROR_CODE = 'DISPATCH_FAILED';

export interface SendGroupPortalLinksInput {
  groupId: string;
  actor: AuthContext;
  /** IANA timezone for per-day idempotency bucketing. See bulk-resend-reminder. */
  actorTimezone?: string;
}

export interface SendGroupPortalLinksOutput {
  results: SendGroupPortalLinksResultItem[];
}

/**
 * Send the tenant confirmation portal link to every appointment in a group.
 *
 * Mirrors `BulkResendReminderUseCase` (sequential loop, per-appointment
 * idempotency, per-item result envelope, never aborts the batch) and adds the
 * group eligibility rule via the shared `classifyPortalLinkAction` resolver:
 *
 *   - SKIP_NOT_SENDABLE / SKIP_ALREADY_CONFIRMED → recorded as a skip, no dispatch.
 *   - SEND → dispatch via GeneratePortalTokenUseCase (per-day idempotent).
 *   - SEND_AFTER_RESET → the appointment is CONFIRMED but for a stale date/time;
 *     rotate the confirmation cycle to PENDING for the current date FIRST (so
 *     GeneratePortalTokenUseCase.createInitial links the fresh token instead of
 *     throwing on the date mismatch), then dispatch. This branch BYPASSES the
 *     idempotency cache READ — a genuine date change must always resend even if
 *     a reminder went out earlier today — but still WRITES the cache so a second
 *     same-day click is an IDEMPOTENT_REPLAY.
 *
 * `rotateOnDateChange` and `GeneratePortalTokenUseCase` each open their own
 * transaction; they are not atomic with each other. If the dispatch throws after
 * the rotate committed, the item is ERROR (not cached) and a retry re-classifies
 * the now-PENDING appointment as a plain SEND — self-healing.
 */
export class SendGroupPortalLinksUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly generatePortalToken: GeneratePortalTokenUseCase,
    private readonly cycleService: ConfirmationCycleService,
    private readonly idempotency: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: SendGroupPortalLinksInput): Promise<SendGroupPortalLinksOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'service_group.send_portal_links',
      entityType: 'ServiceGroup',
      entityId: input.groupId,
    });

    const groupTenantScope = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const found = await this.groupRepo.findById(input.groupId, groupTenantScope);
    if (!found) {
      throw new NotFoundError('SERVICE_GROUP_NOT_FOUND', `Service group ${input.groupId} not found`);
    }

    const rows = await this.groupRepo.findGroupAppointmentsWithConfirmation(input.groupId);
    // OP acts only on their own tenant's appointments; AM is cross-tenant.
    const inScope = input.actor.role === 'AM' ? rows : rows.filter((r) => r.tenantId === input.actor.tenantId);

    const dayKey = dayKeyInTz(this.clock(), input.actorTimezone);
    const results: SendGroupPortalLinksResultItem[] = [];

    for (const row of inScope) {
      const action = classifyPortalLinkAction(row);

      if (action === 'SKIP_NOT_SENDABLE') {
        results.push({ appointmentId: row.id, status: 'NOT_SENDABLE' });
        continue;
      }
      if (action === 'SKIP_ALREADY_CONFIRMED') {
        results.push({ appointmentId: row.id, status: 'ALREADY_CONFIRMED' });
        continue;
      }

      const idemKey = `bulk_resend:${row.id}:${dayKey}`;

      // A genuine date change must always resend, so SEND_AFTER_RESET skips the
      // cache read. Plain SEND honours the per-day bucket.
      if (action === 'SEND') {
        const cached = await this.idempotency.getWithHash<SendGroupPortalLinksResultItem>(
          idemKey,
          IDEMPOTENCY_SCOPE,
        );
        if (cached) {
          results.push({ appointmentId: row.id, status: 'IDEMPOTENT_REPLAY' });
          continue;
        }
      }

      try {
        if (action === 'SEND_AFTER_RESET') {
          await this.cycleService.rotateOnDateChange(
            row.id,
            row.tenantId,
            row.scheduledDate,
            row.timeSlot,
            'DATE_CHANGED',
          );
        }

        const dispatch = await this.generatePortalToken.execute({ appointmentId: row.id, actor: input.actor });
        const status: SendGroupPortalLinksResultItem['status'] =
          dispatch.dispatched === false && dispatch.reason === 'NO_PRIMARY_CONTACT'
            ? 'NO_PRIMARY_CONTACT'
            : action === 'SEND_AFTER_RESET'
              ? 'DATE_CHANGED_RESENT'
              : 'SENT';

        const result: SendGroupPortalLinksResultItem = { appointmentId: row.id, status };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Dispatch failed';
        results.push({
          appointmentId: row.id,
          status: 'ERROR',
          error: { code: ERROR_CODE, message },
        });
      }
    }

    // One aggregate audit for the operator action. Per-item token/cycle audits
    // already come from GeneratePortalTokenUseCase and rotateOnDateChange.
    this.auditService.log({
      action: 'service_group.portal_links_sent',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'ServiceGroup',
      entityId: input.groupId,
      tenantId: input.actor.tenantId ?? found.primaryTenantId ?? undefined,
      metadata: {
        total: results.length,
        sent: results.filter((r) => r.status === 'SENT').length,
        dateChangedResent: results.filter((r) => r.status === 'DATE_CHANGED_RESENT').length,
        alreadyConfirmed: results.filter((r) => r.status === 'ALREADY_CONFIRMED').length,
        notSendable: results.filter((r) => r.status === 'NOT_SENDABLE').length,
        noPrimaryContact: results.filter((r) => r.status === 'NO_PRIMARY_CONTACT').length,
        idempotentReplay: results.filter((r) => r.status === 'IDEMPOTENT_REPLAY').length,
        errors: results.filter((r) => r.status === 'ERROR').length,
      },
    });

    return { results };
  }
}
