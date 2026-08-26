import type { Logger } from './logger';
import { MANDATORY_TEMPLATE_CODES } from '../../modules/notification/domain/notification.constants';
import {
  PLATFORM_TEMPLATES,
  platformTemplateContentHash,
  platformTemplateEffectiveContent,
  resolvePlatformTemplateClass,
} from '../../modules/notification/domain/platform-notification-templates';
import { TemplateRendererService } from '../../modules/notification/domain/template-renderer.service';
import { prisma } from './prisma';

export async function checkMandatoryTemplates(logger: Logger): Promise<void> {
  try {
    const existingTemplates = await prisma.notificationTemplate.findMany({
      where: { tenant_id: null },
      select: { template_code: true },
    });

    const existingCodes = new Set(existingTemplates.map((t) => t.template_code));
    const missingCodes: string[] = [];

    for (const code of MANDATORY_TEMPLATE_CODES) {
      if (!existingCodes.has(code)) {
        missingCodes.push(code);
      }
    }

    if (missingCodes.length > 0) {
      logger.warn(
        { missingCodes, missingCount: missingCodes.length, totalRequired: MANDATORY_TEMPLATE_CODES.length },
        `Missing ${missingCodes.length} mandatory notification templates (default/global). Create them to enable all notification flows.`,
      );
    } else {
      logger.info('All mandatory notification templates are present');
    }
  } catch (err) {
    logger.warn(
      { error: err },
      'Could not check mandatory notification templates at startup (non-fatal)',
    );
  }
}

/**
 * Keeps the platform-default rows (`tenant_id = NULL`) in step with the code
 * catalog (PLATFORM_TEMPLATES), so a template/layout change ships on deploy
 * instead of waiting for a manual seeder run.
 *
 * Safety rule: a row is only rewritten while its current content still matches
 * the seed hash it was written with. A human edit breaks the match and the row
 * is left alone (logged as skipped). Rows whose content already equals the
 * catalog get their hash stamped ("adopted") so future refreshes apply.
 */
export async function syncPlatformTemplates(logger: Logger, db: typeof prisma = prisma): Promise<void> {
  try {
    const templateRenderer = new TemplateRendererService();
    const rows = await db.notificationTemplate.findMany({ where: { tenant_id: null } });
    const byKey = new Map(rows.map((r) => [`${r.template_code}:${r.channel}`, r]));

    let created = 0;
    let refreshed = 0;
    let adopted = 0;
    const skipped: string[] = [];

    for (const entry of PLATFORM_TEMPLATES) {
      // Per-entry isolation: one failing entry (e.g. a unique-constraint race
      // with another instance booting concurrently) must not abort the sync of
      // every remaining template.
      try {
        const content = platformTemplateEffectiveContent(entry);
        const catalogHash = platformTemplateContentHash(content);
        const row = byKey.get(`${entry.code}:${entry.channel}`);

        if (!row) {
          const variables = templateRenderer.extractVariables(
            `${content.subject ?? ''} ${content.bodyText} ${content.bodyHtml ?? ''}`,
          );
          await db.notificationTemplate.create({
            data: {
              tenant_id: null,
              template_code: entry.code,
              channel: entry.channel,
              subject: content.subject,
              body_text: content.bodyText,
              body_html: content.bodyHtml,
              variables_json: variables,
              is_active: true,
              notification_class: resolvePlatformTemplateClass(entry),
              seeded_content_hash: catalogHash,
            },
          });
          created += 1;
          continue;
        }

        const rowHash = platformTemplateContentHash({
          subject: row.subject,
          bodyText: row.body_text,
          bodyHtml: row.body_html,
        });
        const catalogClass = resolvePlatformTemplateClass(entry);

        if (rowHash === catalogHash) {
          // Content already matches the catalog — stamp the hash if missing and
          // pick up a classification-only catalog change, which no content hash
          // can detect.
          if (row.seeded_content_hash !== catalogHash || row.notification_class !== catalogClass) {
            await db.notificationTemplate.update({
              where: { id: row.id },
              data: { seeded_content_hash: catalogHash, notification_class: catalogClass },
            });
            adopted += 1;
          }
          continue;
        }

        if (row.seeded_content_hash === rowHash) {
          const variables = templateRenderer.extractVariables(
            `${content.subject ?? ''} ${content.bodyText} ${content.bodyHtml ?? ''}`,
          );
          await db.notificationTemplate.update({
            where: { id: row.id },
            data: {
              subject: content.subject,
              body_text: content.bodyText,
              body_html: content.bodyHtml,
              variables_json: variables,
              notification_class: catalogClass,
              seeded_content_hash: catalogHash,
              // is_active deliberately untouched: deactivation is an operator
              // decision, not seed content.
            },
          });
          refreshed += 1;
        } else {
          // Human-edited content: never rewrite the body/subject. The
          // classification is not operator content, though — it is
          // catalog-derived and drives consent/opt-out handling, so a stale
          // class must still be corrected without touching the edited copy.
          if (row.notification_class !== catalogClass) {
            await db.notificationTemplate.update({
              where: { id: row.id },
              data: { notification_class: catalogClass },
            });
          }
          skipped.push(`${entry.code}/${entry.channel}`);
        }
      } catch (entryErr) {
        const isUniqueConflict =
          typeof entryErr === 'object' && entryErr !== null && (entryErr as { code?: string }).code === 'P2002';
        logger.warn(
          { error: entryErr, templateCode: entry.code, channel: entry.channel, isUniqueConflict },
          isUniqueConflict
            ? 'Platform template already created by a concurrent instance — skipping'
            : 'Could not sync one platform template — continuing with the rest',
        );
      }
    }

    logger.info(
      { created, refreshed, adopted, skippedCount: skipped.length, skipped },
      'Platform notification templates synced with the code catalog',
    );
  } catch (err) {
    logger.warn(
      { error: err },
      'Could not sync platform notification templates at startup (non-fatal)',
    );
  }
}
