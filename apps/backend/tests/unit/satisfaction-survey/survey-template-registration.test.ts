import { describe, expect, it } from 'vitest';
import {
  MANDATORY_TEMPLATE_CODES,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_VARIABLES,
  ALLOWED_VARIABLES,
  SAMPLE_DATA,
  getTemplateTarget,
  getDefaultClass,
} from '@properfy/shared';
import { PLATFORM_TEMPLATES } from '../../../src/modules/notification/domain/platform-notification-templates';
import { SENSITIVE_PAYLOAD_KEYS } from '../../../src/modules/notification/domain/notification.constants';

const CODE = 'INSPECTION_SATISFACTION_SURVEY';

/**
 * Registering a notification template means touching several independent
 * registries. Most are typed exhaustively and fail the build when missed, but
 * the seed catalogue and the redaction list are plain arrays — a new code can be
 * fully "registered" and still never render, or leak its link forever.
 */
describe(`${CODE} registration`, () => {
  it('is in the tenant-editable catalogue', () => {
    expect(MANDATORY_TEMPLATE_CODES).toContain(CODE);
  });

  it('has a human label', () => {
    expect(TEMPLATE_CODE_LABELS[CODE]).toBeTruthy();
  });

  it('targets the rental tenant, so the agency kill switch governs it', () => {
    // Load-bearing, not cosmetic: SendNotificationUseCase reads the target to
    // decide whether an agency that disabled occupant notifications suppresses
    // this message and mirrors it to the property manager instead.
    expect(getTemplateTarget(CODE)).toBe('RENTAL_TENANT');
  });

  it('is consent-checked rather than protected', () => {
    // A feedback request is not an appointment action the recipient must receive
    // regardless of opt-out.
    expect(getDefaultClass(CODE)).toBe('OPERATIONAL');
  });

  it('requires only the survey link', () => {
    // BuildNotificationPayloadService throws on a missing required variable and
    // loses the send, so anything the copy survives without stays optional.
    expect(TEMPLATE_VARIABLES[CODE].required).toEqual(['surveyLink']);
  });

  it('declares surveyLink as a renderable variable with preview data', () => {
    expect(ALLOWED_VARIABLES).toContain('surveyLink');
    expect(SAMPLE_DATA.surveyLink).toBeTruthy();
  });

  it('redacts surveyLink from stored payloads', () => {
    // It carries a live portal token. An unlisted link stays readable in
    // payload_json forever after the send — the easiest miss in this checklist.
    expect(SENSITIVE_PAYLOAD_KEYS).toContain('surveyLink');
  });

  it('has a seeded EMAIL body that actually renders the link', () => {
    const seeded = PLATFORM_TEMPLATES.filter((t) => t.code === CODE);

    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.channel).toBe('EMAIL');
    expect(seeded[0]!.subject).toBeTruthy();
    expect(seeded[0]!.body).toContain('{{surveyLink}}');
    expect(seeded[0]!.bodyHtml).toContain('{{surveyLink}}');
  });

  it('tells the recipient what the inspector will see', () => {
    // The portal states this before submission; the email that drives them there
    // must not imply the comment is private from everyone.
    const seeded = PLATFORM_TEMPLATES.find((t) => t.code === CODE);
    expect(seeded!.bodyHtml).toMatch(/only sees the rating/i);
  });

  it('renders no variable outside the declared allow-list', () => {
    // A typo in a Handlebars key renders empty rather than failing, so the body
    // is checked against the registry instead of trusted.
    const seeded = PLATFORM_TEMPLATES.find((t) => t.code === CODE)!;
    const declared = new Set<string>([
      ...TEMPLATE_VARIABLES[CODE].required,
      ...TEMPLATE_VARIABLES[CODE].optional,
    ]);

    // `else` is a Handlebars keyword, not a variable — the shared email layout
    // wraps every tenant body in `{{#if properfyLogoUrl}}…{{else}}…{{/if}}`.
    const HANDLEBARS_KEYWORDS = new Set(['else']);

    const used = [...`${seeded.subject ?? ''}${seeded.body}${seeded.bodyHtml ?? ''}`.matchAll(
      /\{\{#?if\s+([a-zA-Z]+)\}\}|\{\{([a-zA-Z]+)\}\}/g,
    )]
      .map((m) => m[1] ?? m[2]!)
      .filter((v) => !HANDLEBARS_KEYWORDS.has(v));

    for (const variable of used) {
      expect(declared, `"${variable}" is rendered but not declared`).toContain(variable);
    }
  });
});
