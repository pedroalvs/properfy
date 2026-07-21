import { describe, it, expect } from 'vitest';
import {
  ALLOWED_VARIABLES,
  MANDATORY_TEMPLATE_CODES,
  PLATFORM_ONLY_TEMPLATE_CODES,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_VARIABLES,
} from './notification-templates';

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
