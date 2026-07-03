import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useAppSave } from './useAppSave';
import { EMPTY_APP_FORM, type AppFormData } from '../types';

vi.mock('@/services/api', () => ({ api: { POST: vi.fn(), PATCH: vi.fn() } }));

const VALID: AppFormData = {
  ...EMPTY_APP_FORM,
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Airbnb',
  username: 'host',
  password: 'secret',
};

describe('useAppSave.validate', () => {
  it('passes a complete create payload', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate(VALID, 'create')).toEqual({});
  });

  it('flags missing required fields on create', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    const errors = result.current.validate({ ...EMPTY_APP_FORM }, 'create');
    expect(errors.tenantId).toBeDefined();
    expect(errors.name).toBeDefined();
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('allows a partial edit payload (tenantId not required)', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate({ ...VALID, tenantId: '' }, 'edit')).toEqual({});
  });

  it('requires authCode when needsAuthCode is checked (create)', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    const errors = result.current.validate({ ...VALID, needsAuthCode: true, authCode: '' }, 'create');
    expect(errors.authCode).toBeDefined();
    expect(result.current.validate({ ...VALID, needsAuthCode: true, authCode: '123' }, 'create')).toEqual({});
  });

  it('rejects invalid urls and accepts valid or empty ones', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate({ ...VALID, appUrl: 'not-a-url' }, 'create').appUrl).toBeDefined();
    expect(result.current.validate({ ...VALID, instructionsUrl: 'nope' }, 'create').instructionsUrl).toBeDefined();
    expect(result.current.validate({ ...VALID, appUrl: 'https://x.com', instructionsUrl: '' }, 'create')).toEqual({});
  });

  it('accepts branch and optional secret fields', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate({
      ...VALID,
      branchId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
      instructionsPassword: 'doc-pass',
    }, 'create')).toEqual({});
  });
});
