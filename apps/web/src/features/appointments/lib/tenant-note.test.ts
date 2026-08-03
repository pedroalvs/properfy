import { describe, it, expect } from 'vitest';
import { TENANT_NOTE_TOOLTIP_MAX_CHARS, formatTenantNoteTooltip } from './tenant-note';

describe('formatTenantNoteTooltip', () => {
  it('falls back to the generic notice when the list payload carries no note text', () => {
    expect(formatTenantNoteTooltip(null)).toBe('Tenant left a note');
    expect(formatTenantNoteTooltip(undefined)).toBe('Tenant left a note');
  });

  it('falls back to the generic notice for a whitespace-only note', () => {
    expect(formatTenantNoteTooltip('   \n  ')).toBe('Tenant left a note');
  });

  it('shows the tenant note text', () => {
    expect(formatTenantNoteTooltip('I work night shifts, please come after 2pm')).toBe(
      'Note: I work night shifts, please come after 2pm',
    );
  });

  it('trims surrounding whitespace from the note', () => {
    expect(formatTenantNoteTooltip('  after 2pm  ')).toBe('Note: after 2pm');
  });

  it('truncates a long note so the tooltip stays readable', () => {
    const note = 'x'.repeat(TENANT_NOTE_TOOLTIP_MAX_CHARS + 50);

    const label = formatTenantNoteTooltip(note);

    expect(label).toBe(`Note: ${'x'.repeat(TENANT_NOTE_TOOLTIP_MAX_CHARS)}…`);
  });

  it('does not truncate a note sitting exactly on the limit', () => {
    const note = 'x'.repeat(TENANT_NOTE_TOOLTIP_MAX_CHARS);

    expect(formatTenantNoteTooltip(note)).toBe(`Note: ${note}`);
  });
});
