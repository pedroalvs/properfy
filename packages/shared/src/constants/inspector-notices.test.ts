import { describe, it, expect } from 'vitest';
import {
  COMPLETION_REMINDER_DEDUPE_PREFIX,
  buildCompletionReminderDedupeKey,
} from './inspector-notices';

describe('inspector notices dedupe', () => {
  it('exposes the completion-reminder dedupe prefix', () => {
    expect(COMPLETION_REMINDER_DEDUPE_PREFIX).toBe('completion-reminder');
  });

  it('builds a stable completion-reminder dedupe key per appointment, civil date and inspector', () => {
    expect(
      buildCompletionReminderDedupeKey({
        appointmentId: 'a1',
        civilDate: '2026-11-03',
        inspectorId: 'i1',
      }),
    ).toBe('completion-reminder:a1:2026-11-03:i1');
  });

  it('includes the inspector so a re-offer to a different inspector gets its own reminder', () => {
    const base = { appointmentId: 'a1', civilDate: '2026-11-03' };
    expect(buildCompletionReminderDedupeKey({ ...base, inspectorId: 'i1' })).not.toBe(
      buildCompletionReminderDedupeKey({ ...base, inspectorId: 'i2' }),
    );
  });
});
