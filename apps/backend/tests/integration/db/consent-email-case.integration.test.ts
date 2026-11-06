/**
 * Real-DB proof of the F06-2 consent email-casing fix: an EMAIL opt-out blocks a
 * lookup with any other casing of the same address, including a pre-F06-2
 * mixed-case row inserted directly (no data migration). Phone (E.164) matching
 * stays exact. Fails on develop (where findByScope matched case-sensitively).
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaNotificationConsentRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-consent.repository';

let harness: DbHarness;
let repo: PrismaNotificationConsentRepository;
let tenantId = '';

async function seedRawConsent(recipient: string, channel: 'EMAIL' | 'SMS'): Promise<void> {
  const now = new Date();
  await harness.prisma.notificationConsent.create({
    data: {
      id: randomUUID(), recipient, channel, tenant_id: tenantId, notification_class: 'OPERATIONAL',
      opted_out: true, opted_out_at: now, change_source: 'operator_override', changed_at: now,
      changed_by_user_id: null, reason: 'stop', created_at: now, updated_at: now,
    },
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationConsentRepository(harness.prisma);
  const t = await harness.prisma.tenant.create({ data: { name: 'C', legal_name: 'C LLC', status: 'ACTIVE', timezone: 'Australia/Sydney' } });
  tenantId = t.id;
  // A LEGACY mixed-case email opt-out, as F06-1 would have stored it.
  await seedRawConsent('Ana@Example.com', 'EMAIL');
  await seedRawConsent('+61412000001', 'SMS');
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('consent email casing (real DB)', () => {
  it('blocks any casing of the opted-out email', async () => {
    for (const spelling of ['ana@example.com', 'ANA@EXAMPLE.COM', 'Ana@Example.com', '  ana@example.com  ']) {
      const found = await repo.findByScope({ tenantId, recipient: spelling, channel: 'EMAIL', notificationClass: 'OPERATIONAL' });
      expect(found?.isOptedOut()).toBe(true);
    }
  });

  it('does not match a different email', async () => {
    const found = await repo.findByScope({ tenantId, recipient: 'other@example.com', channel: 'EMAIL', notificationClass: 'OPERATIONAL' });
    expect(found).toBeNull();
  });

  it('matches the phone opt-out exactly', async () => {
    const found = await repo.findByScope({ tenantId, recipient: '+61412000001', channel: 'SMS', notificationClass: 'OPERATIONAL' });
    expect(found?.isOptedOut()).toBe(true);
  });

  it('listByRecipient finds the row from a mixed-case email query', async () => {
    const rows = await repo.listByRecipient({ tenantId, recipient: 'ANA@EXAMPLE.COM' });
    expect(rows.some((r) => r.channel === 'EMAIL')).toBe(true);
  });
});
