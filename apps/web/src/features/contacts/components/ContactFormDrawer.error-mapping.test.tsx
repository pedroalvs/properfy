/**
 * Code-review Issue 4 — `mapErrorCodeToField` covers the backend error
 * codes emitted after 024 §FR-310 (`*_ALREADY_EXISTS`). The pre-fix
 * mapping used `*_EXISTS` (sans `_ALREADY`) so the inline form error
 * never fired and the user saw a generic snackbar instead of the
 * field-level affordance.
 */

import { describe, it, expect } from 'vitest';
import { mapErrorCodeToField } from './ContactFormDrawer';

describe('mapErrorCodeToField (Issue 4)', () => {
  it('maps CONTACT_EMAIL_ALREADY_EXISTS to the primaryEmail field with the global-uniqueness message', () => {
    expect(mapErrorCodeToField('CONTACT_EMAIL_ALREADY_EXISTS')).toEqual({
      field: 'primaryEmail',
      message: 'Email already exists globally',
    });
  });

  it('maps CONTACT_PHONE_ALREADY_EXISTS to the primaryPhone field', () => {
    expect(mapErrorCodeToField('CONTACT_PHONE_ALREADY_EXISTS')).toEqual({
      field: 'primaryPhone',
      message: 'Phone already exists globally',
    });
  });

  it('returns null for the legacy / pre-024 codes (sans _ALREADY) — they are no longer emitted', () => {
    expect(mapErrorCodeToField('CONTACT_EMAIL_EXISTS')).toBeNull();
    expect(mapErrorCodeToField('CONTACT_PHONE_EXISTS')).toBeNull();
  });

  it('returns null for unrelated codes so the caller falls back to the snackbar', () => {
    expect(mapErrorCodeToField('SOMETHING_ELSE')).toBeNull();
    expect(mapErrorCodeToField(undefined)).toBeNull();
  });
});
