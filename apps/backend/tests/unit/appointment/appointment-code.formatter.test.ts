import { describe, it, expect } from 'vitest';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';

const formatter = new AppointmentCodeFormatter();

function makeTenant(appointmentCodePrefix: string | null = null) {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    appointmentCodePrefix,
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('AppointmentCodeFormatter', () => {
  it('uses default prefix INS when the tenant has no appointmentCodePrefix', () => {
    expect(formatter.format(1, makeTenant())).toBe('INS-0001');
  });

  it('uses the custom prefix from the tenant column', () => {
    expect(formatter.format(42, makeTenant('APT'))).toBe('APT-0042');
  });

  it('uses an alphanumeric prefix from the tenant column', () => {
    expect(formatter.format(42, makeTenant('AB12'))).toBe('AB12-0042');
  });

  it('falls back to INS when appointmentCodePrefix is empty string', () => {
    expect(formatter.format(5, makeTenant(''))).toBe('INS-0005');
  });

  it('falls back to INS when appointmentCodePrefix is null', () => {
    expect(formatter.format(5, makeTenant(null))).toBe('INS-0005');
  });

  it('pads single-digit number to 4 digits', () => {
    expect(formatter.format(1, makeTenant())).toBe('INS-0001');
  });

  it('pads two-digit number to 4 digits', () => {
    expect(formatter.format(99, makeTenant())).toBe('INS-0099');
  });

  it('handles 4-digit number without padding', () => {
    expect(formatter.format(9999, makeTenant())).toBe('INS-9999');
  });

  it('handles appointment number 0', () => {
    expect(formatter.format(0, makeTenant())).toBe('INS-0000');
  });

  it('handles appointment number 1000', () => {
    expect(formatter.format(1000, makeTenant())).toBe('INS-1000');
  });

  describe('parse()', () => {
    it('parses "INS-0042" and returns 42', () => {
      expect(AppointmentCodeFormatter.parse('INS-0042')).toBe(42);
    });

    it('parses "ABC-0001" and returns 1', () => {
      expect(AppointmentCodeFormatter.parse('ABC-0001')).toBe(1);
    });

    it('parses "INS-12345" and returns 12345', () => {
      expect(AppointmentCodeFormatter.parse('INS-12345')).toBe(12345);
    });

    it('parses an alphanumeric prefix "AB12-0042" and returns 42', () => {
      expect(AppointmentCodeFormatter.parse('AB12-0042')).toBe(42);
    });

    it('returns null for "invalid"', () => {
      expect(AppointmentCodeFormatter.parse('invalid')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(AppointmentCodeFormatter.parse('')).toBeNull();
    });

    it('returns null for "INS-" (prefix with no number)', () => {
      expect(AppointmentCodeFormatter.parse('INS-')).toBeNull();
    });

    it('returns null for "-0042" (no prefix)', () => {
      expect(AppointmentCodeFormatter.parse('-0042')).toBeNull();
    });

    it('returns 0 for "INS-0000"', () => {
      expect(AppointmentCodeFormatter.parse('INS-0000')).toBe(0);
    });

    it('handles lowercase prefix', () => {
      expect(AppointmentCodeFormatter.parse('ins-0042')).toBe(42);
    });
  });

  /**
   * The search box accepts what the operator sees on screen. The code is
   * DISPLAYED zero-padded ("INS-0071") but STORED as a plain integer (71), so a
   * bare "0071" has to be read as a number — a substring match against the
   * stored value would compare against "71" and never match it.
   */
  describe('parseSearchTerm', () => {
    it('accepts a fully formatted code, like parse does', () => {
      expect(AppointmentCodeFormatter.parseSearchTerm('INS-0071')).toBe(71);
      expect(AppointmentCodeFormatter.parseSearchTerm('ab12-0007')).toBe(7);
    });

    it('accepts the zero-padded number on its own — the reported gap', () => {
      expect(AppointmentCodeFormatter.parseSearchTerm('0071')).toBe(71);
    });

    it('accepts a plain number', () => {
      expect(AppointmentCodeFormatter.parseSearchTerm('71')).toBe(71);
      expect(AppointmentCodeFormatter.parseSearchTerm('0')).toBe(0);
    });

    it('tolerates surrounding whitespace', () => {
      expect(AppointmentCodeFormatter.parseSearchTerm('  0071  ')).toBe(71);
    });

    it('returns null for text, so the caller falls back to the text search', () => {
      for (const term of ['Kogarah', '', '   ', 'INS-', '-0042', '12a', '7.5', '-5']) {
        expect(AppointmentCodeFormatter.parseSearchTerm(term), term).toBeNull();
      }
    });

    it('returns null above the int4 ceiling instead of overflowing Postgres', () => {
      // appointment_number is an `integer`; handing Postgres 99999999999 makes
      // the whole query throw, turning a search into a 500.
      expect(AppointmentCodeFormatter.parseSearchTerm('2147483647')).toBe(2147483647);
      expect(AppointmentCodeFormatter.parseSearchTerm('2147483648')).toBeNull();
      expect(AppointmentCodeFormatter.parseSearchTerm('99999999999')).toBeNull();
    });

    it('leaves parse() strict — it still only accepts a formatted code', () => {
      expect(AppointmentCodeFormatter.parse('0071')).toBeNull();
    });
  });
});
