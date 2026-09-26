/**
 * Real-database test for "reset a platform default back to the seed".
 *
 * A reset stages the shipped catalog body into the editor; saving it must return
 * the platform-default row to a *seeded* state — the hand-written seed body_text
 * and the seed content hash — so `syncPlatformTemplates` recognises it as unedited
 * and keeps refreshing it on deploy. Before the fix, the save derived body_text
 * from HTML and never wrote seeded_content_hash, so every reset row stayed marked
 * "human-edited" and the sync stopped tracking it.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/reset-platform-template-readopt.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { syncPlatformTemplates } from '../../../src/shared/infrastructure/template-startup-check';
import {
  PLATFORM_TEMPLATES,
  platformTemplateContentHash,
  platformTemplateEffectiveContent,
} from '../../../src/modules/notification/domain/platform-notification-templates';
import { UpsertNotificationTemplateUseCase } from '../../../src/modules/notification/application/use-cases/upsert-notification-template.use-case';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import { SanitizeHtmlService } from '../../../src/modules/notification/infrastructure/sanitize-html.service';
import { HtmlToTextService } from '../../../src/modules/notification/infrastructure/html-to-text.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import type { Logger } from '../../../src/shared/infrastructure/logger';

let harness: DbHarness;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

const SEED = PLATFORM_TEMPLATES.find(
  (t) => t.code === 'INSPECTION_CANCELLED' && t.channel === 'EMAIL',
)!;
const CATALOG = platformTemplateEffectiveContent(SEED);
const CATALOG_HASH = platformTemplateContentHash(CATALOG);

const AM: AuthContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

function makeUseCase() {
  const auditService = { log: vi.fn() } as unknown as AuditService;
  return new UpsertNotificationTemplateUseCase(
    new PrismaNotificationTemplateRepository(harness.prisma),
    new TemplateRendererService(),
    auditService,
    new AuthorizationService(auditService),
    new SanitizeHtmlService(),
    new HtmlToTextService(),
  );
}

function skippedFromSyncLog(): string[] {
  // syncPlatformTemplates logs a single info summary carrying the `skipped` list.
  const summary = vi.mocked(logger.info).mock.calls.map((c) => c[0]).find(
    (arg): arg is { skipped: string[] } =>
      typeof arg === 'object' && arg !== null && Array.isArray((arg as { skipped?: unknown }).skipped),
  );
  return summary?.skipped ?? [];
}

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE notification_templates, tenants CASCADE`);
});

describe('reset a platform default re-adopts the seed (real Postgres)', () => {
  it('an operator edit un-seeds the row, and syncPlatformTemplates then protects (skips) it', async () => {
    await syncPlatformTemplates(logger, harness.prisma);

    await makeUseCase().execute({
      templateCode: 'INSPECTION_CANCELLED',
      channel: 'EMAIL',
      subject: 'Operator custom subject',
      bodyHtml: '<p>Operator custom copy for {{propertyAddress}}</p>',
      isActive: true,
      actor: AM,
    });

    const edited = await harness.prisma.notificationTemplate.findFirstOrThrow({
      where: { tenant_id: null, template_code: 'INSPECTION_CANCELLED', channel: 'EMAIL' },
    });
    expect(edited.seeded_content_hash).toBeNull();

    vi.clearAllMocks();
    await syncPlatformTemplates(logger, harness.prisma);
    expect(skippedFromSyncLog()).toContain('INSPECTION_CANCELLED/EMAIL');
  });

  it('reset+save restores the seed body_text and hash, so the sync tracks the row again', async () => {
    await syncPlatformTemplates(logger, harness.prisma);

    // Operator edits it (un-seeds), then resets to the catalog and saves.
    const useCase = makeUseCase();
    await useCase.execute({
      templateCode: 'INSPECTION_CANCELLED',
      channel: 'EMAIL',
      subject: 'Operator custom subject',
      bodyHtml: '<p>Operator custom copy for {{propertyAddress}}</p>',
      isActive: true,
      actor: AM,
    });
    await useCase.execute({
      templateCode: 'INSPECTION_CANCELLED',
      channel: 'EMAIL',
      subject: CATALOG.subject ?? undefined,
      bodyHtml: CATALOG.bodyHtml!,
      isActive: true,
      actor: AM,
    });

    const row = await harness.prisma.notificationTemplate.findFirstOrThrow({
      where: { tenant_id: null, template_code: 'INSPECTION_CANCELLED', channel: 'EMAIL' },
    });
    // Byte-identical to a fresh seed: hand-written plain-text body + the seed hash.
    expect(row.body_html).toBe(CATALOG.bodyHtml);
    expect(row.body_text).toBe(CATALOG.bodyText);
    expect(row.subject).toBe(CATALOG.subject);
    expect(row.seeded_content_hash).toBe(CATALOG_HASH);

    // The sync now treats it as seeded again — it is NOT in the skipped (human-edited) set.
    vi.clearAllMocks();
    await syncPlatformTemplates(logger, harness.prisma);
    expect(skippedFromSyncLog()).not.toContain('INSPECTION_CANCELLED/EMAIL');
  });
});
