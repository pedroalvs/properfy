import { describe, it, expect } from 'vitest';
import {
  ALLOWED_VARIABLES,
  MANDATORY_TEMPLATE_CODES,
  NOTIFICATION_TARGETS,
  PLATFORM_ONLY_TEMPLATE_CODES,
  PLATFORM_TEMPLATE_CODE_LABELS,
  SAMPLE_DATA,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_TARGETS,
  TEMPLATE_VARIABLES,
  getTemplateCodeLabel,
  getTemplateTarget,
} from './notification-templates';
import { formatCivilDate, formatWallTimeRange } from '../utils/format-display-date';

describe('TEMPLATE_CODE_LABELS', () => {
  it('covers exactly the mandatory template codes', () => {
    expect(new Set(Object.keys(TEMPLATE_CODE_LABELS))).toEqual(new Set(MANDATORY_TEMPLATE_CODES));
  });

  it('maps every code to a non-empty label', () => {
    for (const code of MANDATORY_TEMPLATE_CODES) {
      expect(TEMPLATE_CODE_LABELS[code]).toBeTypeOf('string');
      expect(TEMPLATE_CODE_LABELS[code].trim().length).toBeGreaterThan(0);
    }
  });
});

describe('SAMPLE_DATA', () => {
  // The operator edits a template against this preview and ships it. If the
  // preview renders a shape the real send never produces, they are tuning the
  // wording around a lie — so these must come from the same formatters that
  // build the outgoing payload, not from hand-written literals.
  it('renders the temporal samples exactly as the real payload does', () => {
    expect(SAMPLE_DATA.scheduledDate).toBe(formatCivilDate('2026-04-15'));
    expect(SAMPLE_DATA.timeSlot).toBe(formatWallTimeRange('09:00', '12:00'));
  });

  it('shows a civil date and a 12-hour window, never the wire shapes', () => {
    expect(SAMPLE_DATA.scheduledDate).toBe('15/04/2026');
    expect(SAMPLE_DATA.timeSlot).toBe('9:00 am – 12:00 pm');
  });
});

describe('PLATFORM_TEMPLATE_CODE_LABELS', () => {
  it('covers exactly the platform-only template codes', () => {
    expect(new Set(Object.keys(PLATFORM_TEMPLATE_CODE_LABELS))).toEqual(
      new Set(PLATFORM_ONLY_TEMPLATE_CODES),
    );
  });

  it('maps every code to a non-empty label', () => {
    for (const code of PLATFORM_ONLY_TEMPLATE_CODES) {
      expect(PLATFORM_TEMPLATE_CODE_LABELS[code].trim().length).toBeGreaterThan(0);
    }
  });

  it('shares no code with the mandatory catalog', () => {
    for (const code of PLATFORM_ONLY_TEMPLATE_CODES) {
      expect(MANDATORY_TEMPLATE_CODES).not.toContain(code);
    }
  });
});

describe('getTemplateCodeLabel', () => {
  it('resolves a mandatory code', () => {
    expect(getTemplateCodeLabel('INSPECTION_NOTICE')).toBe('Inspection Notice');
  });

  it('resolves a platform-only code', () => {
    expect(getTemplateCodeLabel('INSPECTOR_GROUP_ASSIGNED')).toBe('Inspector Group Assigned');
  });

  it('falls back to the raw code for an unknown template', () => {
    expect(getTemplateCodeLabel('SOME_CUSTOM_CODE')).toBe('SOME_CUSTOM_CODE');
  });

  it('does not resolve inherited Object members as labels', () => {
    // Bare indexing would hand back a function here, which React renders as a crash.
    expect(getTemplateCodeLabel('constructor')).toBe('constructor');
    expect(getTemplateCodeLabel('toString')).toBe('toString');
  });
});

describe('TEMPLATE_TARGETS', () => {
  it('covers exactly the mandatory and platform-only template codes', () => {
    expect(new Set(Object.keys(TEMPLATE_TARGETS))).toEqual(
      new Set([...MANDATORY_TEMPLATE_CODES, ...PLATFORM_ONLY_TEMPLATE_CODES]),
    );
  });

  it('maps every code to a declared target', () => {
    for (const target of Object.values(TEMPLATE_TARGETS)) {
      expect(NOTIFICATION_TARGETS).toContain(target);
    }
  });

  it('keeps an SMS variant on the same target as its email counterpart', () => {
    let comparedPairs = 0;
    for (const code of MANDATORY_TEMPLATE_CODES) {
      if (!code.endsWith('_SMS')) continue;
      const emailCode = code.slice(0, -'_SMS'.length) as keyof typeof TEMPLATE_TARGETS;
      // An SMS-only template with no email sibling has nothing to compare against, so it is
      // skipped rather than failed — but count the real comparisons so this cannot quietly
      // become a no-op assertion if the catalog is restructured.
      if (!Object.prototype.hasOwnProperty.call(TEMPLATE_TARGETS, emailCode)) continue;
      expect(TEMPLATE_TARGETS[code]).toBe(TEMPLATE_TARGETS[emailCode]);
      comparedPairs += 1;
    }
    // 8 pairs today: inspection notice, the three reminders, confirmed, rescheduled,
    // cancelled, unavailability-reported. (TENANT_SMS_ALERT is not an `_SMS` variant.)
    expect(comparedPairs).toBeGreaterThanOrEqual(8);
  });

  it('routes each dispatch family to the recipient its call site actually uses', () => {
    // Traced to the dispatch sites; see the map's doc comment for file references.
    expect(TEMPLATE_TARGETS.INSPECTION_NOTICE).toBe('RENTAL_TENANT');
    expect(TEMPLATE_TARGETS.REMINDER_7_DAYS).toBe('RENTAL_TENANT');
    expect(TEMPLATE_TARGETS.TENANT_PORTAL_LINK).toBe('RENTAL_TENANT');
    expect(TEMPLATE_TARGETS.PROPERTY_MANAGER_ESCALATION).toBe('PROPERTY_MANAGER');
    expect(TEMPLATE_TARGETS.INSPECTOR_GROUP_ASSIGNED).toBe('INSPECTOR');
    expect(TEMPLATE_TARGETS.REPORT_READY).toBe('USER_ACCOUNT');
    expect(TEMPLATE_TARGETS.PASSWORD_RESET).toBe('USER_ACCOUNT');
    expect(TEMPLATE_TARGETS.INSPECTION_STUCK_ALERT).toBe('PLATFORM_OPS');
  });

  it('sends TENANT_SMS_ALERT to the rental tenant, not to an internal inbox', () => {
    expect(TEMPLATE_TARGETS.TENANT_SMS_ALERT).toBe('RENTAL_TENANT');
  });
});

describe('getTemplateTarget', () => {
  it('resolves a known code', () => {
    expect(getTemplateTarget('PROPERTY_MANAGER_ESCALATION')).toBe('PROPERTY_MANAGER');
  });

  it('returns undefined for a code outside both catalogs', () => {
    expect(getTemplateTarget('SOME_CUSTOM_CODE')).toBeUndefined();
  });
});

describe('PASSWORD_RESET template', () => {
  it('is platform-only, not tenant-customizable', () => {
    expect(PLATFORM_ONLY_TEMPLATE_CODES).toContain('PASSWORD_RESET');
    expect(MANDATORY_TEMPLATE_CODES).not.toContain('PASSWORD_RESET');
  });

  it('declares userName and resetLink as required variables', () => {
    expect(TEMPLATE_VARIABLES.PASSWORD_RESET).toEqual({
      required: ['userName', 'resetLink'],
      optional: [],
    });
  });

  it('allows the resetLink variable', () => {
    expect(ALLOWED_VARIABLES).toContain('resetLink');
  });
});
