import type { PrismaClient } from '@prisma/client';
import type { AuthContext, SendGroupPortalLinksResultItem } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type {
  GeneratePortalTokenOutput,
  GeneratePortalTokenUseCase,
} from '../../../rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { classifyPortalLinkAction } from '../../../appointment/domain/portal-link-eligibility';
import { isTenantNotificationsBlockedError } from '../../../appointment/domain/tenant-notifications-blocked';
import { dayKeyInTz } from '../../../appointment/application/use-cases/bulk-action-shared';
import { runInTransaction, type AfterCommitResult } from '../../../../shared/application/unit-of-work';
import { retryOnUniqueConflict } from '../../../../shared/domain/retry-on-unique-conflict';
import { TOKEN_HASH_COLUMN } from '../../../rental-tenant-portal/domain/mint-portal-token.service';

type SerializedResendResult =
  | { action: Exclude<ReturnType<typeof classifyPortalLinkAction>, 'SEND_AFTER_RESET'> }
  | {
      action: 'SEND_AFTER_RESET';
      afterCommit: AfterCommitResult<GeneratePortalTokenOutput>;
    };

function reclassifiedResendStatus(
  action: Exclude<ReturnType<typeof classifyPortalLinkAction>, 'SEND_AFTER_RESET'>,
): SendGroupPortalLinksResultItem['status'] {
  switch (action) {
    case 'SEND':
      // The stale snapshot was already reset by the transaction that held this
      // tenant lock first. Avoid minting another token that would revoke its link.
      return 'IDEMPOTENT_REPLAY';
    case 'SKIP_NOT_SENDABLE':
      return 'NOT_SENDABLE';
    case 'SKIP_ALREADY_CONFIRMED':
      return 'ALREADY_CONFIRMED';
    case 'SKIP_TENANT_NOTIFICATIONS_BLOCKED':
      return 'TENANT_NOTIFICATIONS_BLOCKED';
  }
}

// EXACT reuse of the bulk-resend idempotency bucket: a same-day reminder already
// sent (from the map bulk flow or a prior group click) is a no-op here too —
// both dispatch the identical TENANT_PORTAL_LINK notification.
const IDEMPOTENCY_SCOPE = 'bulk_resend_reminder';
const IDEMPOTENCY_TTL_HOURS = 36;
const ERROR_CODE = 'DISPATCH_FAILED';
const TRANSACTION_REQUIRED_MESSAGE = 'SEND_AFTER_RESET requires a transactional unit of work';

export interface SendGroupPortalLinksInput {
  groupId: string;
  actor: AuthContext;
  /**
   * Restrict the send to these members. Used when a schedule change only
   * invalidated some confirmations — the untouched members must not be mailed.
   * Omit to send to the whole group, which is what the operator's explicit
   * "Send portal link" action does.
   */
  appointmentIds?: string[];
  /** IANA timezone for per-day idempotency bucketing. See bulk-resend-reminder. */
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
 * For SEND_AFTER_RESET, the current policy check, cycle rotation, token mint and
 * cycle link share one transaction. Result-bearing notification creation runs
 * after commit; a blocked policy or mint failure therefore cannot leak a reset.
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
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: SendGroupPortalLinksInput): Promise<SendGroupPortalLinksOutput> {
    // Deliberately narrower than the per-appointment portal-link surface, which
    // also allows CL_ADMIN: a service group is tenant-agnostic and its members
    // may span agencies, so a single agency admin must not fan out links across
    // it. Do not "harmonise" this with `appointment.portal_link`.
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
    const tenantScoped = input.actor.role === 'AM' ? rows : rows.filter((r) => r.tenantId === input.actor.tenantId);
    const inScope = input.appointmentIds
      ? tenantScoped.filter((r) => input.appointmentIds!.includes(r.id))
      : tenantScoped;

    const dayKey = dayKeyInTz(this.clock());
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
      if (action === 'SKIP_TENANT_NOTIFICATIONS_BLOCKED') {
        // Skipped, not errored: for a cross-agency group this is an expected
        // outcome for some members, and GeneratePortalTokenUseCase would throw
        // TENANT_NOTIFICATIONS_BLOCKED here anyway. Not cached — the operator can
        // flip the agency setting and re-run the same day.
        results.push({ appointmentId: row.id, status: 'TENANT_NOTIFICATIONS_BLOCKED' });
        continue;
      }
      if (action !== 'SEND' && action !== 'SEND_AFTER_RESET') {
        // Exhaustiveness guard, not dead code. The branches above are an if-chain, so a
        // future PortalLinkPlannedAction variant would fall straight through to the
        // dispatch below and silently notify a tenant it was meant to skip. Failing the
        // single item keeps the batch alive while making the omission impossible to miss.
        const unhandled: never = action;
        results.push({
          appointmentId: row.id,
          status: 'ERROR',
          error: { code: ERROR_CODE, message: `Unhandled portal-link action: ${String(unhandled)}` },
        });
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
        let dispatch;
        if (action === 'SEND_AFTER_RESET') {
          // A stale confirmation must never be reset without the same
          // transaction also owning the authoritative policy read and token
          // writes. Lightweight callers without a Unit of Work fail closed.
          const prisma = this.prisma;
          if (!prisma) throw new Error(TRANSACTION_REQUIRED_MESSAGE);

          const serialized = await retryOnUniqueConflict<SerializedResendResult>(
            TOKEN_HASH_COLUMN,
            () => runInTransaction(prisma, async (ctx) => {
              const generateInput = { appointmentId: row.id, actor: input.actor };
              // Lock the tenant before loading the appointment, then classify the
              // current group row through the same transaction. A concurrent
              // resend therefore observes the first reset instead of rotating
              // and invalidating its freshly minted link.
              const generation = await this.generatePortalToken.prepareInTransaction(
                generateInput,
                ctx,
                row.tenantId,
              );
              const current = await this.groupRepo.findGroupAppointmentWithConfirmation(
                input.groupId,
                row.id,
                row.tenantId,
                ctx.tx,
              );
              if (!current) {
                return { action: 'SKIP_NOT_SENDABLE' };
              }
              const currentAction = classifyPortalLinkAction(current);
              if (currentAction !== 'SEND_AFTER_RESET') {
                return { action: currentAction };
              }
              await this.cycleService.rotateOnDateChange(
                current.id,
                current.tenantId,
                current.scheduledDate,
                current.timeSlot,
                'DATE_CHANGED',
                ctx.tx,
                ctx.defer,
              );
              return { action: 'SEND_AFTER_RESET', afterCommit: await generation.runWritePhase() };
            }),
          );
          if (serialized.action !== 'SEND_AFTER_RESET') {
            results.push({ appointmentId: row.id, status: reclassifiedResendStatus(serialized.action) });
            continue;
          }
          dispatch = await serialized.afterCommit.runAfterCommit();
        } else {
          dispatch = await this.generatePortalToken.execute({ appointmentId: row.id, actor: input.actor });
        }

        if (dispatch.dispatched === false) {
          if (dispatch.reason === 'NO_PRIMARY_CONTACT') {
            // No canonical recipient — a stable outcome; cache it so a same-day
            // retry is a no-op (matches bulk-resend).
            const result: SendGroupPortalLinksResultItem = { appointmentId: row.id, status: 'NO_PRIMARY_CONTACT' };
            await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
            results.push(result);
          } else {
            // DISPATCH_FAILED — the notification never went out. Surface as ERROR
            // and do NOT cache, so a retry re-attempts the send.
            results.push({
              appointmentId: row.id,
              status: 'ERROR',
              error: { code: ERROR_CODE, message: 'Notification dispatch failed' },
            });
          }
          continue;
        }

        const status: SendGroupPortalLinksResultItem['status'] =
          action === 'SEND_AFTER_RESET' ? 'DATE_CHANGED_RESENT' : 'SENT';
        const result: SendGroupPortalLinksResultItem = { appointmentId: row.id, status };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (e) {
        // The flag can be flipped between the repository snapshot above and the mint
        // below, so the same outcome can arrive as a throw. Report it identically to the
        // planned skip rather than as a generic dispatch error.
        if (isTenantNotificationsBlockedError(e)) {
          results.push({ appointmentId: row.id, status: 'TENANT_NOTIFICATIONS_BLOCKED' });
          continue;
        }
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
        tenantNotificationsBlocked: results.filter((r) => r.status === 'TENANT_NOTIFICATIONS_BLOCKED').length,
        idempotentReplay: results.filter((r) => r.status === 'IDEMPOTENT_REPLAY').length,
        errors: results.filter((r) => r.status === 'ERROR').length,
      },
    });

    return { results };
  }
}
