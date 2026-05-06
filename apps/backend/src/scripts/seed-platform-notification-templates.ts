import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Shared unsubscribe footer used by operational (non-transactional) email templates.
// Transactional templates (INSPECTION_CONFIRMED, INSPECTION_RESCHEDULED, etc.) and all SMS
// templates intentionally omit it — transactional notifications cannot be opted out of,
// and SMS unsubscribe is handled via the STOP keyword.
const OP_EMAIL_FOOTER =
  ' If you no longer wish to receive operational notifications, you can unsubscribe here: {{unsubscribeUrl}}';

const PLATFORM_TEMPLATES = [
  // ── EMAIL templates ────────────────────────────────────────────────────────
  {
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL' as const,
    subject: 'Upcoming Property Inspection',
    body: `Dear {{tenantName}}, an inspection has been scheduled for {{propertyAddress}} on {{scheduledDate}} between {{timeSlot}}. Confirm or reschedule: {{confirmationLink}}.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'REMINDER_7_DAYS',
    channel: 'EMAIL' as const,
    subject: 'Inspection Reminder - 7 Days',
    body: `Dear {{tenantName}}, this is a reminder that your property inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'REMINDER_5_DAYS',
    channel: 'EMAIL' as const,
    subject: 'Inspection Reminder - 5 Days',
    body: `Dear {{tenantName}}, your property inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'REMINDER_3_DAYS',
    channel: 'EMAIL' as const,
    subject: 'Inspection Reminder - 3 Days',
    body: `Dear {{tenantName}}, your property inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'PROPERTY_MANAGER_ESCALATION',
    channel: 'EMAIL' as const,
    subject: 'Tenant Not Responding - Escalation',
    body: `The tenant {{tenantName}} at {{propertyAddress}} has not responded to the inspection notice for {{scheduledDate}}. Please follow up.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'INSPECTION_CONFIRMED',
    channel: 'EMAIL' as const,
    subject: 'Inspection Confirmed',
    body: 'Dear {{tenantName}}, your inspection at {{propertyAddress}} on {{scheduledDate}} has been confirmed.',
  },
  {
    code: 'INSPECTION_RESCHEDULED',
    channel: 'EMAIL' as const,
    subject: 'Inspection Rescheduled',
    body: 'Dear {{tenantName}}, the inspection at {{propertyAddress}} has been rescheduled. New details will follow.',
  },
  {
    code: 'INSPECTION_CANCELLED',
    channel: 'EMAIL' as const,
    subject: 'Inspection Cancelled',
    body: 'Dear {{tenantName}}, the inspection at {{propertyAddress}} on {{scheduledDate}} has been cancelled.',
  },
  {
    code: 'INSPECTION_UNAVAILABILITY_REPORTED',
    channel: 'EMAIL' as const,
    subject: 'Tenant Reported Unavailability',
    body: 'The tenant {{tenantName}} reported that the inspection at {{propertyAddress}} on {{scheduledDate}} is unavailable. Review appointment {{appointmentCode}} for follow-up.',
  },
  {
    code: 'REPORT_READY',
    channel: 'EMAIL' as const,
    subject: 'Your report "{{reportType}}" is ready',
    body: `Hi {{userName}}, your {{reportType}} report is ready. View and download it at {{downloadLink}}. The file is available for 30 days.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'REPORT_FAILED',
    channel: 'EMAIL' as const,
    subject: 'Your report "{{reportType}}" failed',
    body: `Hi {{userName}}, your {{reportType}} report could not be generated. Reason: {{errorMessage}}. You can retry from the reports page: {{downloadLink}}.${OP_EMAIL_FOOTER}`,
  },
  // ── SMS templates ─────────────────────────────────────────────────────────
  {
    code: 'INSPECTION_NOTICE_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, inspection scheduled for {{scheduledDate}}. Confirm: {{confirmationLink}}',
  },
  {
    code: 'REMINDER_7_DAYS_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, your inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.',
  },
  {
    code: 'REMINDER_5_DAYS_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, your inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.',
  },
  {
    code: 'REMINDER_3_DAYS_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, your inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.',
  },
  {
    code: 'TENANT_SMS_ALERT',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Inspection at {{propertyAddress}} on {{scheduledDate}}. Confirm at {{confirmationLink}}',
  },
  {
    code: 'INSPECTION_CONFIRMED_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, your inspection on {{scheduledDate}} has been confirmed.',
  },
  {
    code: 'INSPECTION_RESCHEDULED_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, your inspection on {{scheduledDate}} has been rescheduled. New details will follow.',
  },
  {
    code: 'INSPECTION_CANCELLED_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, the inspection on {{scheduledDate}} has been cancelled.',
  },
  {
    code: 'INSPECTION_UNAVAILABILITY_REPORTED_SMS',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: Hi {{tenantName}}, we received your unavailability report for {{scheduledDate}}. We will be in touch.',
  },
  // ── Portal link (operator-triggered, not mandatory) ──────────────────────
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'EMAIL' as const,
    subject: 'Your property inspection portal',
    body: `Dear {{tenantName}}, confirm, reschedule or update contact details for your inspection on {{scheduledDate}} using this secure link: {{confirmationLink}}.${OP_EMAIL_FOOTER}`,
  },
  {
    code: 'TENANT_PORTAL_LINK',
    channel: 'SMS' as const,
    subject: null,
    body: 'Properfy: inspection on {{scheduledDate}}. Manage it here: {{confirmationLink}}',
  },
];

async function main() {
  let upserted = 0;

  for (const t of PLATFORM_TEMPLATES) {
    const variables = (t.body.match(/\{\{(\w+)\}\}/g) ?? []).map((v) =>
      v.replace(/\{\{|\}\}/g, ''),
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
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
          variables_json: variables,
          is_active: true,
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
