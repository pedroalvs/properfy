import { describe, it, expect } from 'vitest';
import { TEMPLATE_VARIABLES, SAMPLE_DATA } from '@properfy/shared';
import { PLATFORM_TEMPLATES } from '../../../src/scripts/platform-notification-templates';
import { STUCK_ALERT_PAYLOAD_KEYS } from '../../../src/modules/inspector-execution/infrastructure/workers/notify-stuck.worker';
import { SanitizeHtmlService } from '../../../src/modules/notification/infrastructure/sanitize-html.service';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';

function extractVariables(content: string): string[] {
  return (content.match(/\{\{(\w+)\}\}/g) ?? []).map((v) => v.replace(/\{\{|\}\}/g, ''));
}

describe('PLATFORM_TEMPLATES seed data', () => {
  it('includes an EMAIL template for INSPECTION_STUCK_ALERT', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    );

    expect(entry).toBeDefined();
    expect(entry!.subject).toBeTruthy();
    expect(entry!.body).toBeTruthy();
  });

  it('INSPECTION_STUCK_ALERT only uses variables the notify-stuck worker provides', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    )!;

    const used = extractVariables(`${entry.subject ?? ''} ${entry.body}`);
    expect(used.length).toBeGreaterThan(0);
    for (const variable of used) {
      expect(STUCK_ALERT_PAYLOAD_KEYS).toContain(variable);
    }
  });

  it('INSPECTION_STUCK_ALERT is TRANSACTIONAL so an internal ops alert can never be consent-blocked', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    )!;

    expect(entry.notificationClass).toBe('TRANSACTIONAL');
  });

  it('includes an EMAIL template for PASSWORD_RESET', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'PASSWORD_RESET' && t.channel === 'EMAIL',
    );

    expect(entry).toBeDefined();
    expect(entry!.subject).toBeTruthy();
    expect(entry!.body).toBeTruthy();
  });

  it('PASSWORD_RESET only uses variables provided by the request-password-reset use case', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'PASSWORD_RESET' && t.channel === 'EMAIL',
    )!;

    const used = extractVariables(`${entry.subject ?? ''} ${entry.body}`);
    expect(used).toContain('resetLink');
    for (const variable of used) {
      expect(['userName', 'resetLink']).toContain(variable);
    }
  });

  it('PASSWORD_RESET is TRANSACTIONAL so a security email can never be consent-blocked', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'PASSWORD_RESET' && t.channel === 'EMAIL',
    )!;

    expect(entry.notificationClass).toBe('TRANSACTIONAL');
  });
});

// ── Appointment email layout (client-approved dark design) ─────────────────

const APPOINTMENT_EMAIL_CODES = [
  'INSPECTION_NOTICE',
  'REMINDER_7_DAYS',
  'REMINDER_5_DAYS',
  'REMINDER_3_DAYS',
  'PROPERTY_MANAGER_ESCALATION',
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
  'INSPECTION_UNAVAILABILITY_REPORTED',
  'TENANT_PORTAL_LINK',
] as const;

describe('PLATFORM_TEMPLATES appointment email HTML bodies', () => {
  const sanitizer = new SanitizeHtmlService();
  const renderer = new TemplateRendererService();

  for (const code of APPOINTMENT_EMAIL_CODES) {
    const entry = PLATFORM_TEMPLATES.find((t) => t.code === code && t.channel === 'EMAIL');

    it(`${code} has a rich HTML body using the shared layout`, () => {
      expect(entry?.bodyHtml).toBeTruthy();
      // Dark layout markers from the client-approved design
      expect(entry!.bodyHtml).toContain('rgb(47,47,47)');
      // Conditional agency logo footer
      expect(entry!.bodyHtml).toContain('{{#if agencyLogoUrl}}');
    });

    it(`${code} bodyHtml passes the save-time sanitizer unchanged`, () => {
      const result = sanitizer.validateForSave(entry!.bodyHtml!);
      expect(result.rejectedReason).toBeUndefined();
      expect(result.safe).toBe(true);
    });

    it(`${code} bodyHtml only uses variables allowed by its template spec`, () => {
      const spec = TEMPLATE_VARIABLES[code];
      const allowed = new Set([...spec.required, ...spec.optional]);
      const used = renderer.extractVariables(`${entry!.subject ?? ''} ${entry!.bodyHtml!}`);
      for (const variable of used) {
        expect(allowed, `variable "${variable}" not allowed for ${code}`).toContain(variable);
      }
    });

    it(`${code} bodyHtml renders with SAMPLE_DATA leaving no unresolved placeholders`, () => {
      const rendered = renderer.render(entry!.bodyHtml!, { ...SAMPLE_DATA });
      expect(rendered).not.toMatch(/\{\{/);
      const sanitized = sanitizer.sanitizeForRender(rendered);
      expect(sanitized).toContain(SAMPLE_DATA.rentalTenantName);
    });
  }

  it('INSPECTION_NOTICE mirrors the client example (sections, CTA, phone)', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_NOTICE' && t.channel === 'EMAIL',
    )!;
    expect(entry.bodyHtml).toContain('Inspection Process');
    expect(entry.bodyHtml).toContain('Action Required');
    expect(entry.bodyHtml).toContain('Inspection Scheduling');
    expect(entry.bodyHtml).toContain('href="{{confirmationLink}}"');
    expect(entry.bodyHtml).toContain('{{agencyPhone}}');
    expect(entry.bodyHtml).toContain('{{serviceTypeName}}');
    expect(entry.subject).toContain('{{propertyAddress}}');
  });
});
