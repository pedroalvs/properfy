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

  it('requires authCode when needsAuthCode is checked (create and edit)', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    const errors = result.current.validate({ ...VALID, needsAuthCode: true, authCode: '' }, 'create');
    expect(errors.authCode).toBeDefined();
    expect(result.current.validate({ ...VALID, needsAuthCode: true, authCode: '123' }, 'create')).toEqual({});
    expect(result.current.validate({ ...VALID, needsAuthCode: true, authCode: '' }, 'edit').authCode).toBeDefined();
    expect(result.current.validate({ ...VALID, needsAuthCode: true, authCode: '123' }, 'edit')).toEqual({});
  });

  it('rejects invalid urls and accepts valid or empty ones', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate({ ...VALID, appUrl: 'not-a-url' }, 'create').appUrl).toBeDefined();
    expect(result.current.validate({ ...VALID, instructionsUrl: 'nope' }, 'create').instructionsUrl).toBeDefined();
    expect(result.current.validate({ ...VALID, appUrl: 'https://x.com', instructionsUrl: '' }, 'create')).toEqual({});
  });

  it('sends isDefault on create and update payloads', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.POST).mockResolvedValue({ data: { data: { id: 'new-id' } }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({ data: { data: { id: 'cred-1' } }, error: undefined } as never);
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });

    await result.current.save({ ...VALID, isDefault: true });
    expect(vi.mocked(api.POST).mock.calls[0]![1]).toMatchObject({ body: expect.objectContaining({ isDefault: true }) });

    await result.current.save({ ...VALID, isDefault: false }, 'cred-1');
    expect(vi.mocked(api.PATCH).mock.calls[0]![1]).toMatchObject({ body: expect.objectContaining({ isDefault: false }) });
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
