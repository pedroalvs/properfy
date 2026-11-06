/**
 * F06-2 consent email-casing fix. Proves that an EMAIL opt-out recorded for one
 * casing blocks a lookup with any other casing of the same address, while phone
 * (E.164) matching is unchanged. The in-memory prisma fake matches `where`
 * EXACTLY (prisma semantics), so these tests FAIL on develop (where the repo
 * neither lowercased the stored value nor the lookup) and pass with the fix.
 */
import { describe, it, expect, vi } from 'vitest';
import { PrismaNotificationConsentRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';

function makeFakePrisma() {
  const rows: Record<string, unknown>[] = [];
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows,
    notificationConsent: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => match(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => match(r, where))),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { rows.push({ ...data }); }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x['id'] === where.id);
        if (r) Object.assign(r, data);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r['id'] === where.id) ?? null),
    },
    notification: { count: vi.fn(async () => 0) },
  };
}

function optOut(recipient: string, channel: 'EMAIL' | 'SMS'): NotificationConsentEntity {
  const now = new Date();
  return new NotificationConsentEntity({
    id: `c-${recipient}-${channel}`, recipient, channel, tenantId: 't1', notificationClass: 'OPERATIONAL',
    optedOut: true, optedOutAt: now, changeSource: 'operator_override', changedAt: now, changedByUserId: 'am', reason: 'stop', createdAt: now, updatedAt: now,
  });
}

describe('consent email casing (F06-2)', () => {
  it('an EMAIL opt-out blocks a lookup with any other casing of the same address', async () => {
    const prisma = makeFakePrisma();
    const repo = new PrismaNotificationConsentRepository(prisma as never);

    await repo.upsert(optOut('Ana@Example.com', 'EMAIL'));
    // Stored canonically.
    expect(prisma.rows[0]!['recipient']).toBe('ana@example.com');

    for (const spelling of ['ana@example.com', 'ANA@EXAMPLE.COM', 'Ana@Example.com']) {
      const found = await repo.findByScope({ tenantId: 't1', recipient: spelling, channel: 'EMAIL', notificationClass: 'OPERATIONAL' });
      expect(found?.isOptedOut()).toBe(true);
    }
  });

  it('leaves phone (SMS) matching exact', async () => {
    const prisma = makeFakePrisma();
    const repo = new PrismaNotificationConsentRepository(prisma as never);
    await repo.upsert(optOut('+61412000001', 'SMS'));
    expect(prisma.rows[0]!['recipient']).toBe('+61412000001');
    const found = await repo.findByScope({ tenantId: 't1', recipient: '+61412000001', channel: 'SMS', notificationClass: 'OPERATIONAL' });
    expect(found?.isOptedOut()).toBe(true);
  });

  it('listByRecipient matches a mixed-case email query against the stored lowercase row', async () => {
    const prisma = makeFakePrisma();
    const repo = new PrismaNotificationConsentRepository(prisma as never);
    await repo.upsert(optOut('Ana@Example.com', 'EMAIL'));
    const rows = await repo.listByRecipient({ tenantId: 't1', recipient: 'ANA@EXAMPLE.COM' });
    expect(rows).toHaveLength(1);
  });
});
