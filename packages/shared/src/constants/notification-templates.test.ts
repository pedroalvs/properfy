import { describe, it, expect } from 'vitest';
import {
  ALLOWED_VARIABLES,
  MANDATORY_TEMPLATE_CODES,
  PLATFORM_ONLY_TEMPLATE_CODES,
  SAMPLE_DATA,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_VARIABLES,
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
