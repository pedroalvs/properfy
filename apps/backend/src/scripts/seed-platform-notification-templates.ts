import { PrismaClient } from '@prisma/client';
import { PLATFORM_TEMPLATES } from './platform-notification-templates';

const prisma = new PrismaClient();

async function main() {
  let upserted = 0;

  for (const t of PLATFORM_TEMPLATES) {
    // Subject can carry variables too (e.g. REPORT_READY, INSPECTION_STUCK_ALERT),
    // so derive variables_json from subject + body, deduplicated.
    const variables = [
      ...new Set(
        (`${t.subject ?? ''} ${t.body}`.match(/\{\{(\w+)\}\}/g) ?? []).map((v) =>
          v.replace(/\{\{|\}\}/g, ''),
        ),
      ),
    ];

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
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
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
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
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
