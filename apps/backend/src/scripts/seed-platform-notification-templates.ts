import { PrismaClient } from '@prisma/client';
import { PLATFORM_TEMPLATES } from './platform-notification-templates';
import { TemplateRendererService } from '../modules/notification/domain/template-renderer.service';

const prisma = new PrismaClient();

// AST-based extraction (handles block helpers like {{#if agencyLogoUrl}}),
// shared with the runtime render pipeline.
const templateRenderer = new TemplateRendererService();

async function main() {
  let upserted = 0;

  for (const t of PLATFORM_TEMPLATES) {
    // Subject and the rich HTML body can carry variables too, so derive
    // variables_json from subject + body + bodyHtml, deduplicated.
    const bodyHtml = t.channel === 'EMAIL' ? (t.bodyHtml ?? `<p>${t.body}</p>`) : null;
    const variables = templateRenderer.extractVariables(
      `${t.subject ?? ''} ${t.body} ${bodyHtml ?? ''}`,
    );

    const existing = await prisma.notificationTemplate.findFirst({
      where: { tenant_id: null, template_code: t.code, channel: t.channel },
      select: { id: true },
    });

    if (existing) {
      await prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          subject: t.subject,
          body_text: t.body,
          body_html: bodyHtml,
          variables_json: variables,
          is_active: true,
          ...(t.notificationClass ? { notification_class: t.notificationClass } : {}),
        },
      });
    } else {
      await prisma.notificationTemplate.create({
        data: {
          tenant_id: null,
          template_code: t.code,
          channel: t.channel,
          subject: t.subject,
          body_text: t.body,
          body_html: bodyHtml,
          variables_json: variables,
          is_active: true,
          ...(t.notificationClass ? { notification_class: t.notificationClass } : {}),
        },
      });
    }

    upserted++;
  }

  console.log(`Platform notification templates: ${upserted} upserted (tenant_id = NULL).`);
}

main()
  .catch((err) => {
    console.error('seed-platform-notification-templates failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
