/**
 * The satisfaction-survey template row must exist as soon as migrations finish —
 * before any traffic, and without waiting for the manual platform-template seeder.
 *
 * This is not belt-and-braces. `CreateNotificationUseCase` does not throw on a
 * missing template; the send worker marks the row FAILED/TEMPLATE_NOT_FOUND with
 * no retry, and the survey invite's lifetime dedupe counts every row except
 * SKIPPED_OPT_OUT. So a single missing template row permanently locks that
 * appointment out of the invite — re-seeding afterwards does not resurrect it.
 *
 * The harness runs `prisma migrate deploy` and nothing else, which is exactly
 * what the Fly release command does. If someone later removes the seed migration
 * and relies on the manual seeder again, this test fails.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
});

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('platform notification templates seeded by migration', () => {
  it('creates the satisfaction survey template before any seeder runs', async () => {
    const rows = await harness.prisma.notificationTemplate.findMany({
      where: { tenant_id: null, template_code: 'INSPECTION_SATISFACTION_SURVEY' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.channel).toBe('EMAIL');
    expect(rows[0]!.is_active).toBe(true);
    // The link is the whole point of the message; a body without it is useless.
    expect(rows[0]!.body_text).toContain('{{surveyLink}}');
    expect(rows[0]!.body_html).toContain('{{surveyLink}}');
  });

  it('is idempotent — re-running the insert adds no duplicate', async () => {
    // The migration guards on NOT EXISTS rather than ON CONFLICT, because the
    // unique index is (tenant_id, template_code, channel) and Postgres treats
    // NULL tenant_id as distinct, so a conflict would never fire.
    await harness.prisma.$executeRawUnsafe(`
      INSERT INTO notification_templates
        (id, tenant_id, template_code, channel, subject, body_text, body_html,
         variables_json, is_active, notification_class, created_at, updated_at)
      SELECT gen_random_uuid(), NULL, 'INSPECTION_SATISFACTION_SURVEY', 'EMAIL',
             'dup', 'dup', '<p>dup</p>', '[]'::jsonb, true, 'OPERATIONAL', now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM notification_templates
        WHERE tenant_id IS NULL
          AND template_code = 'INSPECTION_SATISFACTION_SURVEY'
          AND channel = 'EMAIL'
      );
    `);

    const rows = await harness.prisma.notificationTemplate.findMany({
      where: { tenant_id: null, template_code: 'INSPECTION_SATISFACTION_SURVEY' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject).not.toBe('dup');
  });
});
