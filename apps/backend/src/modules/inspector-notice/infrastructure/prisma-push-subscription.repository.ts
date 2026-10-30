import type { Prisma, PrismaClient } from '@prisma/client';
import type { PushSubscriptionRevokedReason } from '../domain/inspector-notice.entity';
import type {
  ActivePushSubscription,
  IPushSubscriptionRepository,
  UpsertPushSubscriptionParams,
} from '../domain/push-subscription.repository';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaPushSubscriptionRepository implements IPushSubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** `inspectors.push_enabled = EXISTS(active subscription)`, run on whichever client is given. */
  async recomputePushEnabled(inspectorId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db: DbClient = tx ?? this.prisma;
    await db.$executeRaw`
      UPDATE "inspectors"
         SET "push_enabled" = EXISTS (
           SELECT 1 FROM "inspector_push_subscriptions"
            WHERE "inspector_id" = ${inspectorId} AND "revoked_at" IS NULL
         )
       WHERE "id" = ${inspectorId}`;
  }

  async upsert(params: UpsertPushSubscriptionParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inspectorPushSubscription.findUnique({
        where: { endpoint: params.endpoint },
        select: { inspector_id: true },
      });
      const previousOwner =
        existing && existing.inspector_id !== params.inspectorId ? existing.inspector_id : null;

      await tx.inspectorPushSubscription.upsert({
        where: { endpoint: params.endpoint },
        create: {
          inspector_id: params.inspectorId,
          endpoint: params.endpoint,
          p256dh: params.p256dh,
          auth: params.auth,
          failure_count: 0,
        },
        update: {
          inspector_id: params.inspectorId,
          p256dh: params.p256dh,
          auth: params.auth,
          revoked_at: null,
          revoked_reason: null,
          failure_count: 0,
        },
      });

      await this.recomputePushEnabled(params.inspectorId, tx);
      if (previousOwner) {
        await this.recomputePushEnabled(previousOwner, tx);
      }
    });
  }

  async findActiveByInspector(inspectorId: string): Promise<ActivePushSubscription[]> {
    const rows = await this.prisma.inspectorPushSubscription.findMany({
      where: { inspector_id: inspectorId, revoked_at: null },
      select: { id: true, endpoint: true, p256dh: true, auth: true, failure_count: true },
    });
    return rows.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      failureCount: r.failure_count,
    }));
  }

  async revoke(
    endpoint: string,
    reason: PushSubscriptionRevokedReason,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient): Promise<void> => {
      const sub = await client.inspectorPushSubscription.findUnique({
        where: { endpoint },
        select: { inspector_id: true, revoked_at: true },
      });
      if (!sub) return; // unknown endpoint — no-op
      if (sub.revoked_at === null) {
        await client.inspectorPushSubscription.update({
          where: { endpoint },
          data: { revoked_at: now, revoked_reason: reason },
        });
      }
      await this.recomputePushEnabled(sub.inspector_id, client);
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  async revokeAllForInspector(
    inspectorId: string,
    reason: PushSubscriptionRevokedReason,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient): Promise<void> => {
      // Only active subscriptions — an already-revoked row keeps its original reason/time.
      await client.inspectorPushSubscription.updateMany({
        where: { inspector_id: inspectorId, revoked_at: null },
        data: { revoked_at: now, revoked_reason: reason },
      });
      await this.recomputePushEnabled(inspectorId, client);
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  async incrementFailure(endpoint: string): Promise<number | null> {
    // Atomic increment so two concurrent deliveries do not race on the count.
    const rows = await this.prisma.$queryRaw<{ failure_count: number }[]>`
      UPDATE "inspector_push_subscriptions"
         SET "failure_count" = "failure_count" + 1
       WHERE "endpoint" = ${endpoint} AND "revoked_at" IS NULL
       RETURNING "failure_count"`;
    return rows[0]?.failure_count ?? null;
  }

  async resetFailure(endpoint: string): Promise<void> {
    await this.prisma.inspectorPushSubscription.updateMany({
      where: { endpoint, revoked_at: null },
      data: { failure_count: 0 },
    });
  }

  async unsubscribeOwn(inspectorId: string, endpoint: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sub = await tx.inspectorPushSubscription.findUnique({
        where: { endpoint },
        select: { inspector_id: true, revoked_at: true },
      });
      // Unknown endpoint or someone else's device → idempotent no-op.
      if (!sub || sub.inspector_id !== inspectorId) return;
      if (sub.revoked_at === null) {
        await tx.inspectorPushSubscription.update({
          where: { endpoint },
          data: { revoked_at: now, revoked_reason: 'UNSUBSCRIBED' },
        });
      }
      await this.recomputePushEnabled(inspectorId, tx);
    });
  }

  async purgeRevokedBefore(cutoff: Date, batchSize: number): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.prisma.inspectorPushSubscription.findMany({
        where: { revoked_at: { lt: cutoff } },
        select: { id: true },
        take: batchSize,
      });
      if (batch.length === 0) break;
      await this.prisma.inspectorPushSubscription.deleteMany({
        where: { id: { in: batch.map((b) => b.id) } },
      });
      total += batch.length;
      if (batch.length < batchSize) break;
    }
    return total;
  }
}
