import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shared/infrastructure/prisma', () => ({
  prisma: {
    notificationTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/shared/infrastructure/prisma';
import { syncPlatformTemplates } from '../../../src/shared/infrastructure/template-startup-check';
import {
  PLATFORM_TEMPLATES,
  platformTemplateContentHash,
  platformTemplateEffectiveContent,
  resolvePlatformTemplateClass,
} from '../../../src/modules/notification/domain/platform-notification-templates';
import type { Logger } from '../../../src/shared/infrastructure/logger';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function rowFor(entry: (typeof PLATFORM_TEMPLATES)[number], overrides: Record<string, unknown> = {}) {
  const content = platformTemplateEffectiveContent(entry);
  return {
    id: `row-${entry.code}-${entry.channel}`,
    tenant_id: null,
    template_code: entry.code,
    channel: entry.channel,
    subject: content.subject,
    body_text: content.bodyText,
    body_html: content.bodyHtml,
    variables_json: [],
    is_active: true,
    notification_class: resolvePlatformTemplateClass(entry),
    seeded_content_hash: platformTemplateContentHash(content),
    ...overrides,
  };
}

/** All catalog rows present and hash-stamped, except the ones overridden. */
function allRows(overridesByKey: Record<string, Record<string, unknown>> = {}) {
  return PLATFORM_TEMPLATES.map((entry) =>
    rowFor(entry, overridesByKey[`${entry.code}:${entry.channel}`] ?? {}),
  );
}

describe('syncPlatformTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.notificationTemplate.create).mockResolvedValue({} as never);
    vi.mocked(prisma.notificationTemplate.update).mockResolvedValue({} as never);
  });

  it('creates every catalog row when the table is empty, stamping the seed hash', async () => {
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.create).toHaveBeenCalledTimes(PLATFORM_TEMPLATES.length);
    const first = vi.mocked(prisma.notificationTemplate.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(first.data.tenant_id).toBeNull();
    expect(first.data.seeded_content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does nothing when every row matches the catalog and is already stamped', async () => {
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(allRows() as never);
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.create).not.toHaveBeenCalled();
    expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
  });

  it('adopts an unstamped row whose content already equals the catalog (stamps hash only)', async () => {
    const entry = PLATFORM_TEMPLATES[0];
    const key = `${entry.code}:${entry.channel}`;
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(
      allRows({ [key]: { seeded_content_hash: null } }) as never,
    );
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.notificationTemplate.update).mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where.id).toBe(`row-${entry.code}-${entry.channel}`);
    expect(Object.keys(call.data).sort()).toEqual(['notification_class', 'seeded_content_hash']);
  });

  it('refreshes notification_class when only the catalog classification changed', async () => {
    const entry = PLATFORM_TEMPLATES[0];
    const key = `${entry.code}:${entry.channel}`;
    const staleClass = resolvePlatformTemplateClass(entry) === 'OPERATIONAL' ? 'MARKETING' : 'OPERATIONAL';
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(
      allRows({ [key]: { notification_class: staleClass } }) as never,
    );
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.notificationTemplate.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.notification_class).toBe(resolvePlatformTemplateClass(entry));
  });

  it('a unique-constraint race on one entry does not abort the rest of the sync', async () => {
    const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    vi.mocked(prisma.notificationTemplate.create)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({} as never);
    await syncPlatformTemplates(logger);
    // First create raced and lost; every remaining catalog entry is still created.
    expect(prisma.notificationTemplate.create).toHaveBeenCalledTimes(PLATFORM_TEMPLATES.length);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ isUniqueConflict: true }),
      expect.any(String),
    );
  });

  it('refreshes a stale row still matching its seed hash (untouched since seed)', async () => {
    const entry = PLATFORM_TEMPLATES[0];
    const key = `${entry.code}:${entry.channel}`;
    const oldContent = { subject: 'Old subject', bodyText: 'old body', bodyHtml: '<p>old body</p>' };
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(
      allRows({
        [key]: {
          subject: oldContent.subject,
          body_text: oldContent.bodyText,
          body_html: oldContent.bodyHtml,
          seeded_content_hash: platformTemplateContentHash(oldContent),
          is_active: false,
        },
      }) as never,
    );
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.notificationTemplate.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    const catalogContent = platformTemplateEffectiveContent(entry);
    expect(call.data.body_text).toBe(catalogContent.bodyText);
    expect(call.data.seeded_content_hash).toBe(platformTemplateContentHash(catalogContent));
    // Deactivation is an operator decision, not seed content.
    expect(call.data).not.toHaveProperty('is_active');
  });

  it('skips a human-edited row (content no longer matches its seed hash)', async () => {
    const entry = PLATFORM_TEMPLATES[0];
    const key = `${entry.code}:${entry.channel}`;
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(
      allRows({
        [key]: {
          subject: 'Operator-customised subject',
          seeded_content_hash: platformTemplateContentHash({
            subject: 'What the seeder wrote long ago',
            bodyText: 'x',
            bodyHtml: null,
          }),
        },
      }) as never,
    );
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ skippedCount: 1, skipped: [`${entry.code}/${entry.channel}`] }),
      expect.any(String),
    );
  });

  it('corrects a stale notification_class on a human-edited row without touching its content', async () => {
    const entry = PLATFORM_TEMPLATES[0];
    const key = `${entry.code}:${entry.channel}`;
    const staleClass = resolvePlatformTemplateClass(entry) === 'OPERATIONAL' ? 'MARKETING' : 'OPERATIONAL';
    vi.mocked(prisma.notificationTemplate.findMany).mockResolvedValue(
      allRows({
        [key]: {
          subject: 'Operator-customised subject',
          seeded_content_hash: platformTemplateContentHash({
            subject: 'What the seeder wrote long ago',
            bodyText: 'x',
            bodyHtml: null,
          }),
          notification_class: staleClass,
        },
      }) as never,
    );
    await syncPlatformTemplates(logger);
    expect(prisma.notificationTemplate.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.notificationTemplate.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // Class-only update: the edited content is preserved, never rewritten.
    expect(Object.keys(call.data)).toEqual(['notification_class']);
    expect(call.data.notification_class).toBe(resolvePlatformTemplateClass(entry));
    // The row is still reported as skipped (its content was not refreshed).
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ skippedCount: 1, skipped: [`${entry.code}/${entry.channel}`] }),
      expect.any(String),
    );
  });

  it('never throws — a database failure is logged as a warning', async () => {
    vi.mocked(prisma.notificationTemplate.findMany).mockRejectedValue(new Error('db down'));
    await expect(syncPlatformTemplates(logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
