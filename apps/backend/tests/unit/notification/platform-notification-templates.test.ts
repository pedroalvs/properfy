import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_VARIABLES,
  SAMPLE_DATA,
  getProtectedClass,
  getDefaultClass,
  getTemplateCodeLabel,
  getTemplateTarget,
} from '@properfy/shared';
import {
  PLATFORM_TEMPLATES,
  resolvePlatformTemplateClass,
} from '../../../src/modules/notification/domain/platform-notification-templates';
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

describe('seeded notification class follows the shared catalogue', () => {
  // The bug this guards: the seeder used to write notification_class only when an
  // entry declared it, so every other row landed on the OPERATIONAL schema default
  // — including codes the catalogue marks protected/TRANSACTIONAL. Because
  // upsert-notification-template always applied getProtectedClass, a row's class
  // depended on which write path touched it last.
  it('never resolves a protected code to a class the catalogue contradicts', () => {
    for (const t of PLATFORM_TEMPLATES) {
      const protectedClass = getProtectedClass(t.code);
      if (!protectedClass) continue;
      expect(resolvePlatformTemplateClass(t), `${t.code} (${t.channel})`).toBe(protectedClass);
    }
  });

  it('resolves a real class for every seeded template', () => {
    // toBeTruthy() would be vacuous here: the resolver ends in ?? 'OPERATIONAL',
    // so it can never return a falsy value. Assert membership instead.
    for (const t of PLATFORM_TEMPLATES) {
      expect(
        ['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING'],
        `${t.code} (${t.channel})`,
      ).toContain(resolvePlatformTemplateClass(t));
    }
  });

  // These five are TRANSACTIONAL ONLY because their entry declares it — they are
  // in NEITHER shared classification map, so getDefaultClass alone returns
  // OPERATIONAL for all of them. Nothing else pins that: deleting the field would
  // slip past the protected-contradiction test (they are not protected) and past
  // the membership test above, and PASSWORD_RESET would quietly become
  // consent-suppressible, locking an opted-out user out of account recovery.
  //
  // This PR removes the explicit class from INSPECTION_CANCELLED_AGENCY calling it
  // a workaround, which is precisely the cleanup that must NOT be applied here.
  it.each([
    'INSPECTION_STUCK_ALERT',
    'PASSWORD_RESET',
    'INSPECTOR_GROUP_ASSIGNED',
    'INSPECTOR_GROUP_UNASSIGNED',
    'INSPECTOR_GROUP_RESCHEDULED',
  ])('%s stays TRANSACTIONAL, which only its explicit entry provides', (code) => {
    const entry = PLATFORM_TEMPLATES.find((t) => t.code === code);
    expect(entry, `${code} missing from PLATFORM_TEMPLATES`).toBeDefined();
    expect(getProtectedClass(code)).toBeUndefined();
    expect(getDefaultClass(code)).toBe('OPERATIONAL');
    expect(resolvePlatformTemplateClass(entry!)).toBe('TRANSACTIONAL');
  });

  // Named explicitly because these four are what actually flips in an existing
  // database. Their email twins were set TRANSACTIONAL directly by migration
  // 20260411 (consent_notification_prefs); the SMS legs were created by later
  // seeder runs that never wrote the column, so only they drifted.
  it.each([
    'INSPECTION_CONFIRMED_SMS',
    'INSPECTION_RESCHEDULED_SMS',
    'INSPECTION_CANCELLED_SMS',
    'INSPECTION_UNAVAILABILITY_REPORTED_SMS',
  ])('%s is TRANSACTIONAL, matching its email twin', (code) => {
    const entry = PLATFORM_TEMPLATES.find((t) => t.code === code)!;
    expect(entry).toBeDefined();
    expect(resolvePlatformTemplateClass(entry)).toBe('TRANSACTIONAL');
  });

  it('leaves a non-protected template on its catalogue default rather than forcing TRANSACTIONAL', () => {
    const notice = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_NOTICE' && t.channel === 'EMAIL',
    )!;
    expect(getProtectedClass('INSPECTION_NOTICE')).toBeUndefined();
    expect(resolvePlatformTemplateClass(notice)).toBe('OPERATIONAL');
  });
});

// ── Appointment email layout (no background, dark text on the client canvas) ──

const APPOINTMENT_EMAIL_CODES = [
  'INSPECTION_NOTICE',
  'REMINDER_7_DAYS',
  'REMINDER_5_DAYS',
  'REMINDER_3_DAYS',
  'PROPERTY_MANAGER_ESCALATION',
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
  'INSPECTION_CANCELLED_AGENCY',
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
      // Layout markers: readable heading/link colour on the client's own background
      expect(entry!.bodyHtml).toContain('#21566E');
      // Conditional agency logo footer
      expect(entry!.bodyHtml).toContain('{{#if properfyLogoUrl}}');
    });

    it(`${code} paints no background on the body or the layout tables`, () => {
      // Emails must inherit the mail client's own background instead of forcing
      // one. Matched loosely on purpose: the `background` shorthand and the
      // legacy `bgcolor` attribute would reintroduce a canvas just as well as
      // `background-color`, so a regression cannot slip through a synonym.
      expect(entry!.bodyHtml).not.toMatch(/<body[^>]*\bbackground/i);
      expect(entry!.bodyHtml).not.toMatch(/<table[^>]*\bbackground/i);
      expect(entry!.bodyHtml).not.toMatch(/<(?:body|table)[^>]*\bbgcolor/i);
      // Only inline call-outs may carry a background of their own.
      expect(entry!.bodyHtml).not.toContain('background-image');
    });

    it(`${code} carries none of the retired dark-layout colours`, () => {
      for (const darkColour of ['rgb(47,47,47)', 'rgb(41,41,41)', 'rgb(219,151,255)', 'rgb(94,86,54)']) {
        expect(entry!.bodyHtml, `dark colour ${darkColour} still present`).not.toContain(darkColour);
      }
      // Pure white only ever made sense as text on the dark canvas. The amber
      // call-out fill (#FFF8E1) is deliberately not matched by this pattern.
      expect(entry!.bodyHtml).not.toMatch(/#fff(?:fff)?\b/i);
      // Same colour by keyword rather than hex. Anchored on the CSS property so
      // prose like "Note: white walls" in a future template cannot trip it.
      expect(entry!.bodyHtml).not.toMatch(/(?:color|background)\s*:\s*white\b/i);
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

  it('INSPECTION_CANCELLED_AGENCY addresses the agency, not the rental tenant', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_CANCELLED_AGENCY' && t.channel === 'EMAIL',
    )!;

    // The tenant-facing wrapper opens with "Dear {{rentalTenantName}}" — reusing it
    // here would greet the agency by the tenant's name.
    expect(entry.bodyHtml).not.toContain('Dear {{rentalTenantName}}');
    // The tenant copy closes with a reassurance that makes no sense to the agency.
    expect(entry.bodyHtml).not.toContain('No further action is required from you');
    // Agency-facing heading, mirroring PROPERTY_MANAGER_ESCALATION.
    expect(entry.bodyHtml).toContain('{{#if branchName}}');
    // The reason is the whole point of telling the agency.
    expect(entry.bodyHtml).toContain('{{cancellationReason}}');
  });

  it('INSPECTION_CANCELLED_AGENCY seeds as TRANSACTIONAL so the agency is never consent-blocked', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_CANCELLED_AGENCY' && t.channel === 'EMAIL',
    )!;

    // Derived from the catalogue now, not restated on the entry.
    expect(resolvePlatformTemplateClass(entry)).toBe('TRANSACTIONAL');
    expect(getProtectedClass('INSPECTION_CANCELLED_AGENCY')).toBe('TRANSACTIONAL');
  });

  it('INSPECTION_CANCELLED_AGENCY has no SMS variant', () => {
    expect(
      PLATFORM_TEMPLATES.find(
        (t) => t.code === 'INSPECTION_CANCELLED_AGENCY_SMS',
      ),
    ).toBeUndefined();
  });

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

// ── System emails (Properfy-branded light layout, not tenant-customizable) ──

const SYSTEM_EMAIL_SAMPLES: Record<string, Record<string, string>> = {
  PASSWORD_RESET: { userName: 'Admin User', resetLink: 'https://app.properfy.com/reset?token=x' },
  REPORT_READY: { userName: 'Admin User', reportType: 'Appointments', downloadLink: 'https://app.properfy.com/reports/1' },
  REPORT_FAILED: { userName: 'Admin User', reportType: 'Appointments', errorMessage: 'Server timeout', downloadLink: 'https://app.properfy.com/reports' },
  INSPECTION_STUCK_ALERT: { appointmentId: 'appt-1', inspectorId: 'insp-1', startedAt: '2026-07-23 09:00', hoursStuck: '5' },
};

describe('PLATFORM_TEMPLATES system email HTML bodies', () => {
  const sanitizer = new SanitizeHtmlService();
  const renderer = new TemplateRendererService();

  for (const code of Object.keys(SYSTEM_EMAIL_SAMPLES)) {
    const entry = PLATFORM_TEMPLATES.find((t) => t.code === code && t.channel === 'EMAIL');

    it(`${code} has a rich Properfy-branded HTML body`, () => {
      expect(entry?.bodyHtml).toBeTruthy();
      // Light system layout markers: Properfy logo + coral accent
      expect(entry!.bodyHtml).toContain('properfy-logo-red.png');
      expect(entry!.bodyHtml).toContain('#F37A76');
    });

    it(`${code} bodyHtml passes the save-time sanitizer unchanged`, () => {
      const result = sanitizer.validateForSave(entry!.bodyHtml!);
      expect(result.rejectedReason).toBeUndefined();
      expect(result.safe).toBe(true);
    });

    it(`${code} bodyHtml only uses variables its sender provides`, () => {
      const allowed = new Set(Object.keys(SYSTEM_EMAIL_SAMPLES[code]!));
      const used = renderer.extractVariables(`${entry!.subject ?? ''} ${entry!.bodyHtml!}`);
      for (const variable of used) {
        expect(allowed, `variable "${variable}" not provided for ${code}`).toContain(variable);
      }
    });

    it(`${code} renders leaving no unresolved placeholders`, () => {
      const rendered = renderer.render(entry!.bodyHtml!, SYSTEM_EMAIL_SAMPLES[code]!);
      expect(rendered).not.toMatch(/\{\{/);
    });
  }

  it('PASSWORD_RESET has a reset CTA and stays platform-only (not tenant-editable)', async () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'PASSWORD_RESET' && t.channel === 'EMAIL',
    )!;
    expect(entry.bodyHtml).toContain('href="{{resetLink}}"');
    const shared = await import('@properfy/shared');
    expect(shared.PLATFORM_ONLY_TEMPLATE_CODES).toContain('PASSWORD_RESET');
    expect(shared.MANDATORY_TEMPLATE_CODES).not.toContain('PASSWORD_RESET');
  });

  it('REPORT_READY/FAILED link to the report and STUCK_ALERT shows execution facts', () => {
    const ready = PLATFORM_TEMPLATES.find((t) => t.code === 'REPORT_READY' && t.channel === 'EMAIL')!;
    const failed = PLATFORM_TEMPLATES.find((t) => t.code === 'REPORT_FAILED' && t.channel === 'EMAIL')!;
    const stuck = PLATFORM_TEMPLATES.find((t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL')!;
    expect(ready.bodyHtml).toContain('href="{{downloadLink}}"');
    expect(failed.bodyHtml).toContain('{{errorMessage}}');
    expect(stuck.bodyHtml).toContain('{{appointmentId}}');
    expect(stuck.bodyHtml).toContain('{{hoursStuck}}');
  });
});

describe('every seeded template is presentable on the templates list', () => {
  // The seeded catalog is larger than MANDATORY_TEMPLATE_CODES, and AM/OP see all of it.
  // These guards fail when a template is added to PLATFORM_TEMPLATES without also declaring
  // who receives it and how it should read in the UI.
  const seededCodes = [...new Set(PLATFORM_TEMPLATES.map((t) => t.code))];

  it('covers the whole seeded catalog, not just a sample', () => {
    expect(seededCodes.length).toBeGreaterThanOrEqual(26);
  });

  for (const code of seededCodes) {
    it(`${code} declares a notification target`, () => {
      expect(getTemplateTarget(code)).toBeDefined();
    });

    it(`${code} resolves to a human-readable label`, () => {
      expect(getTemplateCodeLabel(code)).not.toBe(code);
    });
  }
});

describe('legacy INSPECTION_NOTICE assertions', () => {
  it('INSPECTION_NOTICE keeps client-example sections', () => {
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
