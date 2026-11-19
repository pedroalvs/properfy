import type { Prisma } from '@prisma/client';
import type { PushSubscriptionRevokedReason } from './inspector-notice.entity';
import type { PushTarget } from './push-sender';

export type Tx = Prisma.TransactionClient;

/** An active subscription row the delivery job sends to and may revoke/penalize. */
export interface ActivePushSubscription extends PushTarget {
  id: string;
  failureCount: number;
}

export interface UpsertPushSubscriptionParams {
  inspectorId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  now: Date;
}

export interface IPushSubscriptionRepository {
  /**
   * Create or revive the subscription for `endpoint`, (re)assigning it to `inspectorId`,
   * clearing any revocation and resetting `failure_count`; recomputes `push_enabled` for
   * the new owner and (on an ownership move) the previous owner, atomically.
   */
  upsert(params: UpsertPushSubscriptionParams): Promise<void>;

  /** Active (revoked_at IS NULL) subscriptions for an inspector. */
  findActiveByInspector(inspectorId: string): Promise<ActivePushSubscription[]>;

  /** Revoke one endpoint and recompute push_enabled for its owner (atomic). No-op if unknown. */
  revoke(endpoint: string, reason: PushSubscriptionRevokedReason, now: Date, tx?: Tx): Promise<void>;

  /** Revoke every active subscription of an inspector (used by deactivation). Recomputes push_enabled. */
  revokeAllForInspector(
    inspectorId: string,
    reason: PushSubscriptionRevokedReason,
    now: Date,
    tx?: Tx,
  ): Promise<void>;

  /** Atomic `failure_count = failure_count + 1 ... RETURNING failure_count`. Returns the new value (or null if gone). */
  incrementFailure(endpoint: string): Promise<number | null>;
  resetFailure(endpoint: string): Promise<void>;

  /** Revoke the caller's own active endpoint (UNSUBSCRIBED) and recompute. No-op if unknown/foreign. */
  unsubscribeOwn(inspectorId: string, endpoint: string, now: Date): Promise<void>;

  /** Recompute inspectors.push_enabled = EXISTS(active subscription). */
  recomputePushEnabled(inspectorId: string, tx?: Tx): Promise<void>;

  /** Delete subscriptions revoked before `cutoff`, in batches. Returns the number deleted. */
  purgeRevokedBefore(cutoff: Date, batchSize: number): Promise<number>;
}
