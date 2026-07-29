import { describe, it, expect } from 'vitest';
import {
  maskDateText,
  backspaceDateText,
  isoDateToMasked,
  maskedToIsoDate,
  coerceIsoDate,
  expandTwoDigitYear,
  isValidYmd,
  maskTimeText,
  backspaceTimeText,
  applyMeridiem,
  wallTimeToMasked,
  maskedToWallTime,
  coerceWallTime,
  to24h,
} from './date-time-mask';

/** Replays a keystroke sequence through the mask, as the input's onChange does. */
function typeDate(keys: string): string {
  return [...keys].reduce((text, key) => maskDateText(text + key), '');
}

function typeTime(keys: string): string {
  return [...keys].reduce((text, key) => maskTimeText(text + key), '');
}

describe('maskDateText', () => {
  describe('keystroke sequences', () => {
    it('builds dd/mm/yyyy as digits arrive', () => {
      expect(typeDate('1')).toBe('1');
      expect(typeDate('15')).toBe('15/');
      expect(typeDate('156')).toBe('15/06/');
      expect(typeDate('1506')).toBe('15/06/');
      expect(typeDate('15062026')).toBe('15/06/2026');
    });

    it('auto-pads a day that cannot start a two-digit number', () => {
      // 4-9 can only be a single-digit day, so the segment completes at once.
      expect(typeDate('4')).toBe('04/');
      expect(typeDate('9')).toBe('09/');
    });

    it('auto-pads a month that cannot start a two-digit number', () => {
      expect(typeDate('152')).toBe('15/02/');
      expect(typeDate('159')).toBe('15/09/');
    });

    it('waits when the first digit could still begin a two-digit segment', () => {
      expect(typeDate('1')).toBe('1'); // 1 could become 10..19
      expect(typeDate('3')).toBe('3'); // 3 could become 30 or 31
      expect(typeDate('151')).toBe('15/1'); // month 1 could become 10..12
    });

    it('ignores extra digits past a full date', () => {
      expect(typeDate('150620269999')).toBe('15/06/2026');
    });
  });

  describe('paste and wholesale replacement', () => {
    it('accepts a pasted date with any separator', () => {
      expect(maskDateText('15/06/2026')).toBe('15/06/2026');
      expect(maskDateText('15-06-2026')).toBe('15/06/2026');
      expect(maskDateText('15.6.26')).toBe('15/06/26');
    });

    it('redistributes a pasted run of bare digits', () => {
      expect(maskDateText('15062026')).toBe('15/06/2026');
    });
  });

  it('strips non-digits rather than rendering them', () => {
    expect(maskDateText('abc')).toBe('');
  });
});

describe('backspaceDateText', () => {
  it('removes the digit before a trailing separator rather than doing nothing', () => {
    // Re-masking '04/05' would immediately re-append the '/', so a naive
    // implementation makes the key appear dead.
    expect(backspaceDateText('04/05/')).toBe('04/0');
    expect(backspaceDateText('04/0')).toBe('04/');
    expect(backspaceDateText('04/')).toBe('0');
  });

  it('walks a full date back to empty', () => {
    let text = '15/06/2026';
    for (let i = 0; i < 20 && text !== ''; i++) text = backspaceDateText(text);
    expect(text).toBe('');
  });
});

describe('maskedToIsoDate', () => {
  const NOW = 2026;

  it('parses a complete masked date', () => {
    expect(maskedToIsoDate('15/06/2026', NOW)).toBe('2026-06-15');
  });

  it('accepts single-digit day and month', () => {
    expect(maskedToIsoDate('5/6/2026', NOW)).toBe('2026-06-05');
  });

  it('returns null while incomplete', () => {
    expect(maskedToIsoDate('15/', NOW)).toBeNull();
    expect(maskedToIsoDate('15/06/', NOW)).toBeNull();
    expect(maskedToIsoDate('', NOW)).toBeNull();
  });

  it('returns null for an impossible calendar date', () => {
    expect(maskedToIsoDate('31/02/2026', NOW)).toBeNull();
    expect(maskedToIsoDate('29/02/2026', NOW)).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(maskedToIsoDate('29/02/2024', NOW)).toBe('2024-02-29');
  });

  it('expands a two-digit year', () => {
    expect(maskedToIsoDate('15/06/26', NOW)).toBe('2026-06-15');
    expect(maskedToIsoDate('15/06/86', NOW)).toBe('1986-06-15');
  });
});

describe('expandTwoDigitYear', () => {
  it('reads years up to twenty ahead as this century', () => {
    expect(expandTwoDigitYear(26, 2026)).toBe(2026);
    expect(expandTwoDigitYear(46, 2026)).toBe(2046);
  });

  it('reads anything further ahead as last century', () => {
    // Needed for date of birth, the only backward-looking date in the product.
    expect(expandTwoDigitYear(47, 2026)).toBe(1947);
    expect(expandTwoDigitYear(86, 2026)).toBe(1986);
  });
});

describe('isValidYmd', () => {
  it('honours month lengths and leap years', () => {
    expect(isValidYmd(2026, 2, 28)).toBe(true);
    expect(isValidYmd(2026, 2, 29)).toBe(false);
    expect(isValidYmd(2024, 2, 29)).toBe(true);
    expect(isValidYmd(2026, 4, 31)).toBe(false);
    expect(isValidYmd(2026, 13, 1)).toBe(false);
  });
});

describe('isoDateToMasked / coerceIsoDate', () => {
  it('round-trips a canonical date', () => {
    expect(isoDateToMasked('2026-06-15')).toBe('15/06/2026');
    expect(maskedToIsoDate(isoDateToMasked('2026-06-15'), 2026)).toBe('2026-06-15');
  });

  it('accepts a wholesale ISO replacement but not masked text', () => {
    expect(coerceIsoDate('2026-06-15')).toBe('2026-06-15');
    expect(coerceIsoDate('15/06/2026')).toBeNull();
    expect(coerceIsoDate('2026-02-30')).toBeNull();
  });

  it('cannot collide with anything the mask produces', () => {
    // The fast path must be unreachable mid-typing.
    expect(coerceIsoDate(typeDate('15062026'))).toBeNull();
  });
});

describe('maskTimeText', () => {
  describe('the sequence that breaks a flat digit buffer', () => {
    it('keeps 1,3,0 as 1:30 rather than re-slicing to 13:0', () => {
      // A digit-buffer mask renders '1:3' then re-reads its digits as '13',
      // producing '13:0' on the next keystroke.
      expect(typeTime('1')).toBe('1');
      expect(typeTime('13')).toBe('1:3');
      expect(typeTime('130')).toBe('1:30');
    });

    it('keeps a two-digit hour intact', () => {
      expect(typeTime('12')).toBe('12:');
      expect(typeTime('1205')).toBe('12:05');
      expect(typeTime('10')).toBe('10:');
      expect(typeTime('1045')).toBe('10:45');
    });
  });

  describe('keystroke sequences', () => {
    it('completes the hour immediately for 2-9', () => {
      expect(typeTime('9')).toBe('9:');
      expect(typeTime('930')).toBe('9:30');
      expect(typeTime('2')).toBe('2:');
    });

    it('handles a leading zero', () => {
      expect(typeTime('0')).toBe('0');
      expect(typeTime('09')).toBe('9:');
      expect(typeTime('0930')).toBe('9:30');
    });

    it('ignores digits past a full time', () => {
      expect(typeTime('09309')).toBe('9:30');
    });
  });

  it('never invents a meridiem', () => {
    // The product refuses to guess: a wrong guess books an inspection 12h out.
    expect(typeTime('930')).toBe('9:30');
    expect(typeTime('930')).not.toContain('am');
    expect(typeTime('930')).not.toContain('pm');
  });
});

describe('applyMeridiem', () => {
  it('appends the meridiem the user chose', () => {
    expect(applyMeridiem('9:30', 'am')).toBe('9:30 am');
    expect(applyMeridiem('9:30', 'pm')).toBe('9:30 pm');
  });

  it('replaces an existing meridiem', () => {
    expect(applyMeridiem('9:30 am', 'pm')).toBe('9:30 pm');
  });
});

describe('backspaceTimeText', () => {
  it('removes the meridiem first, then minutes, then the hour', () => {
    expect(backspaceTimeText('9:30 am')).toBe('9:30');
    expect(backspaceTimeText('9:30')).toBe('9:3');
    expect(backspaceTimeText('9:3')).toBe('9:');
    expect(backspaceTimeText('9:')).toBe('');
  });

  it('walks a full time back to empty', () => {
    let text = '12:45 pm';
    for (let i = 0; i < 20 && text !== ''; i++) text = backspaceTimeText(text);
    expect(text).toBe('');
  });
});

describe('maskedToWallTime', () => {
  it('parses a complete masked time', () => {
    expect(maskedToWallTime('9:30 am')).toBe('09:30');
    expect(maskedToWallTime('1:30 pm')).toBe('13:30');
  });

  it('returns null without a meridiem, however complete the digits are', () => {
    expect(maskedToWallTime('9:30')).toBeNull();
    expect(maskedToWallTime('12:00')).toBeNull();
  });

  it('returns null while incomplete', () => {
    expect(maskedToWallTime('9:')).toBeNull();
    expect(maskedToWallTime('')).toBeNull();
  });

  it('rejects an out-of-range 12-hour reading', () => {
    expect(maskedToWallTime('13:00 pm')).toBeNull();
    expect(maskedToWallTime('0:30 am')).toBeNull();
  });

  describe('12-hour boundaries', () => {
    it('maps midnight and noon correctly', () => {
      expect(maskedToWallTime('12:00 am')).toBe('00:00');
      expect(maskedToWallTime('12:00 pm')).toBe('12:00');
      expect(maskedToWallTime('12:30 am')).toBe('00:30');
      expect(maskedToWallTime('11:59 pm')).toBe('23:59');
    });
  });
});

describe('to24h', () => {
  it('maps the 12 o'.concat("'").concat('clock edge cases'), () => {
    expect(to24h(12, 0, 'am')).toBe('00:00');
    expect(to24h(12, 0, 'pm')).toBe('12:00');
    expect(to24h(1, 5, 'am')).toBe('01:05');
    expect(to24h(1, 5, 'pm')).toBe('13:05');
  });
});

describe('wallTimeToMasked / coerceWallTime', () => {
  it('round-trips a canonical time', () => {
    expect(wallTimeToMasked('13:30')).toBe('1:30 pm');
    expect(wallTimeToMasked('00:00')).toBe('12:00 am');
    expect(wallTimeToMasked('12:00')).toBe('12:00 pm');
    expect(maskedToWallTime(wallTimeToMasked('13:30'))).toBe('13:30');
  });

  it('accepts a wholesale 24-hour replacement but not masked text', () => {
    expect(coerceWallTime('13:00')).toBe('13:00');
    expect(coerceWallTime('1:00 pm')).toBeNull();
    expect(coerceWallTime('25:00')).toBeNull();
  });

  it('cannot collide with anything the mask produces', () => {
    expect(coerceWallTime(typeTime('1300'))).toBeNull();
  });
});
