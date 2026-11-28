import { describe, it, expect } from 'vitest';
import { SMS_TEMPLATES } from '../sms-templates';

describe('SMS_TEMPLATES', () => {
  it('exposes the five expected templates in order', () => {
    expect(SMS_TEMPLATES.map((t) => t.id)).toEqual([
      'on-my-way',
      'running-late',
      'waiting-outside',
      'couldnt-reach',
      'no-access',
    ]);
  });

  it('signs every message with the inspector first name when known', () => {
    for (const template of SMS_TEMPLATES) {
      expect(template.build('John')).toMatch(/^Hi, it's John, your property inspector\. /);
    }
  });

  it('falls back to a generic signature when no name is known', () => {
    for (const template of SMS_TEMPLATES) {
      for (const empty of [undefined, null, '', '   '] as (string | null | undefined)[]) {
        expect(template.build(empty)).toMatch(/^Hi, it's your property inspector\. /);
      }
    }
  });

  it('trims surrounding whitespace from the name', () => {
    expect(SMS_TEMPLATES[0].build('  John  ')).toContain("it's John, your property inspector.");
  });

  it('keeps bodies GSM-7 safe (no em dash or curly quotes)', () => {
    for (const template of SMS_TEMPLATES) {
      const body = template.build('John');
      expect(body).not.toMatch(/[–—‘’“”]/);
    }
  });
});
