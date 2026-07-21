import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { tenantId: 'tenant-1' } }),
}));

import { useContactSave } from './useContactSave';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { EMPTY_CONTACT_FORM, type ContactFormData } from '../types';

const VALID_FORM: ContactFormData = {
  ...EMPTY_CONTACT_FORM,
  type: 'RENTAL_TENANT',
  displayName: 'Jane Tenant',
  primaryEmail: 'jane@example.com',
};

function runValidate(data: ContactFormData, mode: 'create' | 'edit' = 'create') {
  const { result } = renderHook(() => useContactSave(), { wrapper: createQueryWrapper() });
  return result.current.validate(data, mode);
}

describe('useContactSave.validate — AU phone + per-channel errors', () => {
  it('returns no errors for a valid form with masked AU phone', () => {
    const errors = runValidate({ ...VALID_FORM, primaryPhone: '0412 345 678' });
    expect(errors).toEqual({});
  });

  it('flags an invalid primary phone', () => {
    const errors = runValidate({ ...VALID_FORM, primaryPhone: '12345' });
    expect(errors.primaryPhone).toBe('Must be a valid Australian phone number');
  });

  it('maps an invalid PHONE channel to its row index', () => {
    const errors = runValidate({
      ...VALID_FORM,
      additionalChannels: [
        { channel: 'EMAIL', value: 'ok@example.com', label: '' },
        { channel: 'PHONE', value: '999', label: '' },
      ],
    });
    expect(errors.additionalChannelErrors).toEqual({ 1: 'Must be a valid Australian phone number' });
  });

  it('maps an invalid EMAIL channel to its row index', () => {
    const errors = runValidate({
      ...VALID_FORM,
      additionalChannels: [{ channel: 'EMAIL', value: 'not-an-email', label: '' }],
    });
    expect(errors.additionalChannelErrors).toEqual({ 0: 'Must be a valid email address' });
  });

  it('remaps payload indexes to form row indexes when empty rows are skipped', () => {
    const errors = runValidate({
      ...VALID_FORM,
      additionalChannels: [
        { channel: 'EMAIL', value: '', label: '' }, // empty — dropped from payload
        { channel: 'PHONE', value: '999', label: '' },
      ],
    });
    expect(errors.additionalChannelErrors).toEqual({ 1: 'Must be a valid Australian phone number' });
  });

  it('flags duplicates between primary phone and a channel across formats', () => {
    const errors = runValidate({
      ...VALID_FORM,
      primaryPhone: '+61412345678',
      additionalChannels: [{ channel: 'PHONE', value: '0412 345 678', label: '' }],
    });
    expect(errors.additionalChannels).toBe('Additional channels must not duplicate primary email or phone');
  });

  it('validates on edit mode as well (legacy phones must be corrected)', () => {
    const errors = runValidate({ ...VALID_FORM, primaryPhone: '11999887766' }, 'edit');
    expect(errors.primaryPhone).toBe('Must be a valid Australian phone number');
  });
});
