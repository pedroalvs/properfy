/**
 * Real-database test for the startup platform-template sync.
 *
 * Exists because the mock-based unit test cannot verify:
 *  - the `tenant_id: null` scoping of the sync (a tenant override with the same
 *    template_code + channel must never be touched);
 *  - the partial unique index migration for global rows (`tenant_id IS NULL`),
 *    which the composite unique constraint does not cover in Postgres.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/sync-platform-templates.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { syncPlatformTemplates } from '../../../src/shared/infrastructure/template-startup-check';
import {
  PLATFORM_TEMPLATES,
  platformTemplateContentHash,
  platformTemplateEffectiveContent,
} from '../../../src/modules/notification/domain/platform-notification-templates';
import type { Logger } from '../../../src/shared/infrastructure/logger';

let harness: DbHarness;
let tenantId: string;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

const ENTRY = PLATFORM_TEMPLATES[0];
const CATALOG_CONTENT = platformTemplateEffectiveContent(ENTRY);

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE notification_templates, tenants CASCADE`);
  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Sync Test Agency',
      legal_name: `Sync LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;
});

describe('syncPlatformTemplates (real Postgres)', () => {
  it('creates the missing global row and never touches a tenant override with the same key', async () => {
    const override = await harness.prisma.notificationTemplate.create({
      data: {
        tenant_id: tenantId,
        template_code: ENTRY.code,
        channel: ENTRY.channel,
        subject: 'Agency customised subject',
        body_text: 'agency body',
        body_html: ENTRY.channel === 'EMAIL' ? '<p>agency body</p>' : null,
        variables_json: [],
        is_active: true,
      },
    });

    await syncPlatformTemplates(logger, harness.prisma);

    const globals = await harness.prisma.notificationTemplate.findMany({
      where: { tenant_id: null, template_code: ENTRY.code, channel: ENTRY.channel },
    });
    expect(globals).toHaveLength(1);
    expect(globals[0].body_text).toBe(CATALOG_CONTENT.bodyText);
    expect(globals[0].seeded_content_hash).toBe(platformTemplateContentHash(CATALOG_CONTENT));

    const overrideAfter = await harness.prisma.notificationTemplate.findUniqueOrThrow({
      where: { id: override.id },
    });
    expect(overrideAfter.subject).toBe('Agency customised subject');
    expect(overrideAfter.body_text).toBe('agency body');
    expect(overrideAfter.seeded_content_hash).toBeNull();
  });

  it('adopts an unstamped global row matching the catalog, still leaving the tenant override alone', async () => {
    await harness.prisma.notificationTemplate.create({
      data: {
        tenant_id: null,
        template_code: ENTRY.code,
        channel: ENTRY.channel,
        subject: CATALOG_CONTENT.subject,
        body_text: CATALOG_CONTENT.bodyText,
        body_html: CATALOG_CONTENT.bodyHtml,
        variables_json: [],
        is_active: true,
      },
    });
    const override = await harness.prisma.notificationTemplate.create({
      data: {
        tenant_id: tenantId,
        template_code: ENTRY.code,
        channel: ENTRY.channel,
        subject: 'Agency subject',
        body_text: 'agency body',
        body_html: null,
        variables_json: [],
        is_active: true,
      },
    });

    await syncPlatformTemplates(logger, harness.prisma);

    const global = await harness.prisma.notificationTemplate.findFirstOrThrow({
      where: { tenant_id: null, template_code: ENTRY.code, channel: ENTRY.channel },
    });
    expect(global.seeded_content_hash).toBe(platformTemplateContentHash(CATALOG_CONTENT));

    const overrideAfter = await harness.prisma.notificationTemplate.findUniqueOrThrow({
      where: { id: override.id },
    });
    expect(overrideAfter.seeded_content_hash).toBeNull();
    expect(overrideAfter.body_text).toBe('agency body');
  });

  it('the partial unique index rejects a duplicate global row for the same code/channel', async () => {
    await harness.prisma.notificationTemplate.create({
      data: {
        tenant_id: null,
        template_code: ENTRY.code,
        channel: ENTRY.channel,
        subject: 's1',
        body_text: 'b1',
        body_html: null,
        variables_json: [],
        is_active: true,
      },
    });
    await expect(
      harness.prisma.notificationTemplate.create({
        data: {
          tenant_id: null,
          template_code: ENTRY.code,
          channel: ENTRY.channel,
          subject: 's2',
          body_text: 'b2',
          body_html: null,
          variables_json: [],
          is_active: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
