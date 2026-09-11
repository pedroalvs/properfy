import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  // Several tests assert on `mock.calls[0]`; without this they would read the
  // previous test's request and break on reordering.
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('accepts needsAuthCode on its own — nothing to fill in (create and edit)', () => {
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });
    expect(result.current.validate({ ...VALID, needsAuthCode: true }, 'create')).toEqual({});
    expect(result.current.validate({ ...VALID, needsAuthCode: true }, 'edit')).toEqual({});
  });

  // Create and edit build their payloads through separate functions
  // (toCreatePayload / toUpdatePayload), so both branches are asserted.
  it.each([
    ['create', undefined, 'POST'],
    ['edit', 'cred-1', 'PATCH'],
  ] as const)('sends needsAuthCode but never an auth code value on %s', async (_mode, appId, method) => {
    const { api } = await import('@/services/api');
    vi.mocked(api.POST).mockResolvedValue({ data: { data: { id: 'new-id' } }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({ data: { data: { id: 'cred-1' } }, error: undefined } as never);
    const { result } = renderHook(() => useAppSave(), { wrapper: createQueryWrapper() });

    await result.current.save({ ...VALID, needsAuthCode: true }, appId);
    const [path, options] = vi.mocked(api[method]).mock.calls[0]! as unknown as [
      string,
      { params?: { path?: { id?: string } }; body: Record<string, unknown> },
    ];
    // Typed openapi-fetch routes: templated path + params.path for the {id} form,
    // never a template-literal path with `as any`.
    if (appId) {
      expect(path).toBe('/v1/app-credentials/{id}');
      expect(options.params).toEqual({ path: { id: appId } });
    } else {
      expect(path).toBe('/v1/app-credentials');
    }
    expect(options.body.needsAuthCode).toBe(true);
    expect(options.body).not.toHaveProperty('authCode');
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
    expect(vi.mocked(api.POST).mock.calls[0]![0]).toBe('/v1/app-credentials');
    expect(vi.mocked(api.POST).mock.calls[0]![1]).toMatchObject({ body: expect.objectContaining({ isDefault: true }) });

    await result.current.save({ ...VALID, isDefault: false }, 'cred-1');
    expect(vi.mocked(api.PATCH).mock.calls[0]![0]).toBe('/v1/app-credentials/{id}');
    expect(vi.mocked(api.PATCH).mock.calls[0]![1]).toMatchObject({
      params: { path: { id: 'cred-1' } },
      body: expect.objectContaining({ isDefault: false }),
    });
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
