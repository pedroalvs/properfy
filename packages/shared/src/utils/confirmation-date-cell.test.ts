import { describe, it, expect } from 'vitest';
import { formatConfirmationDateCell } from './confirmation-date-cell';

describe('formatConfirmationDateCell', () => {
  const confirmedAt = new Date('2026-04-10T03:00:00.000Z'); // 10/04 in Sydney

  it("returns 'N/A' for flow types with no occupant to confirm", () => {
    expect(formatConfirmationDateCell('INGOING', confirmedAt)).toBe('N/A');
    expect(formatConfirmationDateCell('OUTGOING', null)).toBe('N/A');
  });

  it('returns the formatted date for a confirmed routine appointment', () => {
    expect(formatConfirmationDateCell('ROUTINE', confirmedAt)).toBe('10/04/2026');
  });

  it('returns blank for a routine appointment still pending confirmation', () => {
    expect(formatConfirmationDateCell('ROUTINE', null)).toBe('');
    expect(formatConfirmationDateCell('ROUTINE', undefined)).toBe('');
  });

  it('fails open on an unknown/missing flow type (treated as confirmable)', () => {
    // Never render N/A for a flow we do not recognise — a routine occupant that
    // slips through must still show its confirmation, not be hidden.
    expect(formatConfirmationDateCell(null, confirmedAt)).toBe('10/04/2026');
    expect(formatConfirmationDateCell('SOMETHING_NEW', null)).toBe('');
  });
});
