import type { AvailabilityTemplate } from '@properfy/shared';
import { summarizeAvailability } from '../availability-summary';

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

function template(active: Partial<Record<keyof AvailabilityTemplate, boolean>>): AvailabilityTemplate {
  return {
    mon: active.mon ? ON : OFF,
    tue: active.tue ? ON : OFF,
    wed: active.wed ? ON : OFF,
    thu: active.thu ? ON : OFF,
    fri: active.fri ? ON : OFF,
    sat: active.sat ? ON : OFF,
    sun: active.sun ? ON : OFF,
  };
}

describe('summarizeAvailability', () => {
  it('returns "Not set" when undefined or empty', () => {
    expect(summarizeAvailability(undefined)).toBe('Not set');
    expect(summarizeAvailability(template({}))).toBe('Not set');
  });

  it('collapses a contiguous run to a range', () => {
    expect(summarizeAvailability(template({ mon: true, tue: true, wed: true, thu: true, fri: true }))).toBe(
      'Mon–Fri',
    );
  });

  it('returns "Every day" when all seven are on', () => {
    expect(
      summarizeAvailability(
        template({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true }),
      ),
    ).toBe('Every day');
  });

  it('names a single day', () => {
    expect(summarizeAvailability(template({ wed: true }))).toBe('Wed');
  });

  it('counts a scattered set of more than three days', () => {
    expect(summarizeAvailability(template({ mon: true, wed: true, fri: true, sun: true }))).toBe(
      '4 days/week',
    );
  });

  it('lists a small scattered set', () => {
    expect(summarizeAvailability(template({ mon: true, fri: true }))).toBe('Mon, Fri');
  });

  it('treats a single am/pm slot as an active day', () => {
    const t = template({});
    t.tue = { am: true, pm: false };
    expect(summarizeAvailability(t)).toBe('Tue');
  });
});
