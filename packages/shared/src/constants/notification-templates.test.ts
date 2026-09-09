import { describe, it, expect } from 'vitest';
import {
  ALLOWED_VARIABLES,
  EDITABLE_TEMPLATE_CODES,
  MANDATORY_TEMPLATE_CODES,
  NOTIFICATION_TARGETS,
  PLATFORM_ONLY_TEMPLATE_CODES,
  PLATFORM_TEMPLATE_CODE_LABELS,
  PROPERFY_LOGO_PATH,
  PROPERFY_LOGO_URL,
  SAMPLE_DATA,
  SYSTEM_TEMPLATE_CODES,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_TARGETS,
  TEMPLATE_VARIABLES,
  buildProperfyLogoUrl,
  getDefaultClass,
  getTemplateCodeLabel,
  getTemplateTarget,
  isEditableTemplateCode,
  isPlatformScopedEditableCode,
  isSystemTemplate,
  matchTemplateCodesBySearch,
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

  it('uses the real Properfy prod domain in its sample links', () => {
    for (const link of [SAMPLE_DATA.confirmationLink, SAMPLE_DATA.surveyLink, SAMPLE_DATA.downloadLink, SAMPLE_DATA.resetLink]) {
      expect(link).toContain('https://app.properfy.me/');
    }
  });
});

describe('buildProperfyLogoUrl', () => {
  it('defaults to the production logo URL', () => {
    expect(PROPERFY_LOGO_URL).toBe(`https://app.properfy.me${PROPERFY_LOGO_PATH}`);
    expect(buildProperfyLogoUrl()).toBe(PROPERFY_LOGO_URL);
    expect(buildProperfyLogoUrl('')).toBe(PROPERFY_LOGO_URL);
    expect(buildProperfyLogoUrl(null)).toBe(PROPERFY_LOGO_URL);
  });

  it('resolves the logo from the given environment web app base URL', () => {
    expect(buildProperfyLogoUrl('https://properfy.pedroalvs.com')).toBe(
      `https://properfy.pedroalvs.com${PROPERFY_LOGO_PATH}`,
    );
    expect(buildProperfyLogoUrl('https://properfy.autolabs.tech')).toBe(
      `https://properfy.autolabs.tech${PROPERFY_LOGO_PATH}`,
    );
    // Trailing slash on the base URL must not double up.
    expect(buildProperfyLogoUrl('https://app.properfy.me/')).toBe(PROPERFY_LOGO_URL);
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
    // 4 pairs today: inspection notice and the three reminders. (TENANT_SMS_ALERT is not
    // an `_SMS` variant.) The confirmed / rescheduled / cancelled / unavailability-reported
    // SMS twins were retired: they only ever restated an email the occupant was already
    // getting for an action they had just taken themselves.
    expect(comparedPairs).toBeGreaterThanOrEqual(4);
  });

  it('leaves no SMS twin on the occupant-action templates', () => {
    // These four are email-only by decision, not by omission. Reinstating a code here
    // without reinstating its dispatch leg would ship a template nothing ever sends.
    for (const retired of [
      'INSPECTION_CONFIRMED_SMS',
      'INSPECTION_RESCHEDULED_SMS',
      'INSPECTION_CANCELLED_SMS',
      'INSPECTION_UNAVAILABILITY_REPORTED_SMS',
    ]) {
      expect(MANDATORY_TEMPLATE_CODES).not.toContain(retired);
      expect(TEMPLATE_TARGETS).not.toHaveProperty(retired);
    }
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

  it('sends the rejection notice to the agency, not to the rental tenant', () => {
    // A rejection is the agency's cue to reschedule, so it goes to the branch
    // contact. The rental tenant who declined already gets their own
    // acknowledgement via INSPECTION_UNAVAILABILITY_REPORTED.
    expect(TEMPLATE_TARGETS.INSPECTION_REJECTED_AGENCY).toBe('PROPERTY_MANAGER');
    expect(TEMPLATE_TARGETS.INSPECTION_REJECTED_AGENCY).toBe(
      TEMPLATE_TARGETS.INSPECTION_CANCELLED_AGENCY,
    );
  });
});

describe('SYSTEM_TEMPLATE_CODES', () => {
  it('contains exactly the templates sent with the system email identity', () => {
    expect(new Set(SYSTEM_TEMPLATE_CODES)).toEqual(
      new Set([
        'PASSWORD_RESET',
        'REPORT_READY',
        'REPORT_FAILED',
        'REGION_DEACTIVATED',
        'INSPECTION_STUCK_ALERT',
      ]),
    );
  });

  it('every code except REGION_DEACTIVATED belongs to a catalog', () => {
    // REGION_DEACTIVATED is dispatched with a literal code and lives in neither
    // catalog; the rest must stay aligned with the registries so a rename there
    // cannot silently detach a template from the system identity.
    const catalogued = new Set<string>([
      ...MANDATORY_TEMPLATE_CODES,
      ...PLATFORM_ONLY_TEMPLATE_CODES,
    ]);
    for (const code of SYSTEM_TEMPLATE_CODES) {
      if (code === 'REGION_DEACTIVATED') continue;
      expect(catalogued).toContain(code);
    }
  });
});

describe('isSystemTemplate', () => {
  it('classifies system templates as system', () => {
    expect(isSystemTemplate('PASSWORD_RESET')).toBe(true);
    expect(isSystemTemplate('REPORT_READY')).toBe(true);
    expect(isSystemTemplate('REPORT_FAILED')).toBe(true);
    expect(isSystemTemplate('REGION_DEACTIVATED')).toBe(true);
    expect(isSystemTemplate('INSPECTION_STUCK_ALERT')).toBe(true);
  });

  it('classifies inspection-facing templates as non-system', () => {
    expect(isSystemTemplate('INSPECTION_NOTICE')).toBe(false);
    expect(isSystemTemplate('INSPECTION_CONFIRMED')).toBe(false);
    expect(isSystemTemplate('TENANT_PORTAL_LINK')).toBe(false);
    expect(isSystemTemplate('INSPECTOR_GROUP_ASSIGNED')).toBe(false);
  });

  it('treats unknown/custom codes as non-system', () => {
    expect(isSystemTemplate('SOME_CUSTOM_CODE')).toBe(false);
    expect(isSystemTemplate('')).toBe(false);
  });

  it('does not resolve inherited Object members as system codes', () => {
    expect(isSystemTemplate('constructor')).toBe(false);
    expect(isSystemTemplate('toString')).toBe(false);
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

describe('TENANT_NOTICE_FORWARDED_AGENCY template', () => {
  it('is platform-only, not tenant-customizable', () => {
    expect(PLATFORM_ONLY_TEMPLATE_CODES).toContain('TENANT_NOTICE_FORWARDED_AGENCY');
    expect(MANDATORY_TEMPLATE_CODES).not.toContain('TENANT_NOTICE_FORWARDED_AGENCY');
  });

  it('targets the agency, which is what stops the forward from re-entering the gate', () => {
    // This is load-bearing, not cosmetic. SendNotificationUseCase suppresses a
    // notification when its target is RENTAL_TENANT and the agency has occupant
    // notifications turned off, then forwards it using THIS code. If the forward
    // were itself RENTAL_TENANT-targeted it would be suppressed and re-forwarded,
    // looping until the queue gave up.
    expect(TEMPLATE_TARGETS.TENANT_NOTICE_FORWARDED_AGENCY).toBe('PROPERTY_MANAGER');
    expect(getTemplateTarget('TENANT_NOTICE_FORWARDED_AGENCY')).not.toBe('RENTAL_TENANT');
  });

  it('is TRANSACTIONAL, so a branch opt-out cannot silence both the occupant and the agency', () => {
    expect(getDefaultClass('TENANT_NOTICE_FORWARDED_AGENCY')).toBe('TRANSACTIONAL');
  });

  it('has a TEMPLATE_VARIABLES entry driving only the editor, never the send', () => {
    // Now editable, so it carries a spec — but its payload is still assembled by hand in
    // SendNotificationUseCase, not by BuildNotificationPayloadService, so this entry drives
    // only the editor toolbar / test-send preview and cannot change what is sent. It carries
    // the suppressed-notice context keys, which live in ALLOWED_VARIABLES.
    expect(TEMPLATE_VARIABLES.TENANT_NOTICE_FORWARDED_AGENCY.required).toEqual([]);
    for (const v of ['suppressedTemplateLabel', 'suppressedChannel']) {
      expect(TEMPLATE_VARIABLES.TENANT_NOTICE_FORWARDED_AGENCY.optional).toContain(v);
      expect(ALLOWED_VARIABLES).toContain(v);
    }
  });
});

describe('agencyLogoUrl variable', () => {
  it('is an allowed variable whose sample is empty — no Properfy fallback', () => {
    expect(ALLOWED_VARIABLES).toContain('agencyLogoUrl');
    // Deliberately empty: a preview/test-send with no resolved agency logo must
    // render nothing (parity with the real send), never substitute the Properfy
    // platform logo into the agency-logo slot.
    expect(SAMPLE_DATA.agencyLogoUrl).toBe('');
  });

  it('is offered exactly where properfyLogoUrl is, for tenant-branded templates', () => {
    // Both logos are injected by the same payload builders for tenant/appointment
    // emails, so a code that can render one can render the other. Properfy-branded
    // emails use the system email layout (Properfy logo only, no agency branding):
    // the system-identity codes (password reset, reports, ops alerts) AND the
    // inspector-group mails, which are inspector-facing operational mail on that same
    // layout. They carry properfyLogoUrl without agencyLogoUrl.
    const isProperfyBranded = (code: string) =>
      isSystemTemplate(code) || code.startsWith('INSPECTOR_GROUP');
    let comparedCodes = 0;
    for (const [code, spec] of Object.entries(TEMPLATE_VARIABLES)) {
      const declared = [...spec.required, ...spec.optional];
      if (isProperfyBranded(code)) {
        expect({ code, agency: declared.includes('agencyLogoUrl') }).toEqual({ code, agency: false });
        continue;
      }
      expect({ code, has: declared.includes('agencyLogoUrl') }).toEqual({
        code,
        has: declared.includes('properfyLogoUrl'),
      });
      if (declared.includes('properfyLogoUrl')) comparedCodes += 1;
    }
    expect(comparedCodes).toBeGreaterThanOrEqual(13);
  });

  it('stays optional everywhere — a tenant without a logo must not lose the send', () => {
    for (const spec of Object.values(TEMPLATE_VARIABLES)) {
      expect(spec.required).not.toContain('agencyLogoUrl');
    }
  });
});

describe('PASSWORD_RESET template', () => {
  it('is platform-only, not tenant-customizable', () => {
    expect(PLATFORM_ONLY_TEMPLATE_CODES).toContain('PASSWORD_RESET');
    expect(MANDATORY_TEMPLATE_CODES).not.toContain('PASSWORD_RESET');
  });

  it('declares userName and resetLink as required variables', () => {
    expect(TEMPLATE_VARIABLES.PASSWORD_RESET.required).toEqual(['userName', 'resetLink']);
    // properfyLogoUrl comes from the system email layout, so the shipped body can be
    // saved unchanged; no agency branding on a system email.
    expect(TEMPLATE_VARIABLES.PASSWORD_RESET.optional).toEqual(['properfyLogoUrl']);
  });

  it('allows the resetLink variable', () => {
    expect(ALLOWED_VARIABLES).toContain('resetLink');
  });
});

describe('EDITABLE_TEMPLATE_CODES', () => {
  it('is the union of the mandatory and platform-only catalogs', () => {
    expect(new Set(EDITABLE_TEMPLATE_CODES)).toEqual(
      new Set([...MANDATORY_TEMPLATE_CODES, ...PLATFORM_ONLY_TEMPLATE_CODES]),
    );
  });

  it('excludes REGION_DEACTIVATED, which is never seeded as a row', () => {
    expect(EDITABLE_TEMPLATE_CODES as readonly string[]).not.toContain('REGION_DEACTIVATED');
  });

  it('has a TEMPLATE_VARIABLES spec for every editable code', () => {
    // The type already enforces this; the runtime assertion guards against a
    // code being added to the array but forgotten in the registry.
    for (const code of EDITABLE_TEMPLATE_CODES) {
      expect(TEMPLATE_VARIABLES[code]).toBeDefined();
    }
  });
});

describe('isEditableTemplateCode', () => {
  it('accepts mandatory and platform-only codes', () => {
    expect(isEditableTemplateCode('INSPECTION_NOTICE')).toBe(true);
    expect(isEditableTemplateCode('PASSWORD_RESET')).toBe(true);
    expect(isEditableTemplateCode('INSPECTOR_GROUP_ASSIGNED')).toBe(true);
    expect(isEditableTemplateCode('INSPECTION_STUCK_ALERT')).toBe(true);
  });

  it('rejects unknown and non-seeded codes', () => {
    expect(isEditableTemplateCode('REGION_DEACTIVATED')).toBe(false);
    expect(isEditableTemplateCode('SOME_CUSTOM_CODE')).toBe(false);
    expect(isEditableTemplateCode('constructor')).toBe(false);
  });
});

describe('isPlatformScopedEditableCode', () => {
  it('is true only for platform-only codes (no per-agency override)', () => {
    for (const code of PLATFORM_ONLY_TEMPLATE_CODES) {
      expect(isPlatformScopedEditableCode(code)).toBe(true);
    }
    expect(isPlatformScopedEditableCode('INSPECTION_NOTICE')).toBe(false);
    expect(isPlatformScopedEditableCode('constructor')).toBe(false);
  });
});

describe('matchTemplateCodesBySearch', () => {
  it('matches on the raw code', () => {
    expect(matchTemplateCodesBySearch('INSPECTION_NOTICE')).toContain('INSPECTION_NOTICE');
  });

  it('matches on the humanized label, case-insensitively', () => {
    // Typing the friendly name must still reach the code.
    expect(matchTemplateCodesBySearch('inspection notice')).toContain('INSPECTION_NOTICE');
    expect(matchTemplateCodesBySearch('password')).toContain('PASSWORD_RESET');
  });

  it('returns an empty array for a blank term', () => {
    expect(matchTemplateCodesBySearch('')).toEqual([]);
    expect(matchTemplateCodesBySearch('   ')).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(matchTemplateCodesBySearch('zzz-no-such-template')).toEqual([]);
  });
});
