import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PropertyFileType, FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn() }),
}));

import { api } from '@/services/api';
import { usePropertyFileUpload } from './usePropertyFileUpload';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const fetchSpy = vi.fn();

function makeFile(name = 'doc.pdf', type = 'application/pdf') {
  return new File(['x'], name, { type });
}

beforeEach(() => {
  mockPost.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-test' });
  }
});

describe('usePropertyFileUpload', () => {
  it('presigns, PUTs with the file content-type, confirms, and invalidates', async () => {
    mockPost
      .mockResolvedValueOnce({
        data: { data: { fileId: 'f1', uploadUrl: 'https://up/url', storageKey: 'k', expiresAt: 'e' } },
        error: undefined,
        response: { status: 201 },
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'f1', type: 'DOCUMENT', status: 'READY' } },
        error: undefined,
        response: { status: 200 },
      });
    fetchSpy.mockResolvedValue({ ok: true } as Response);

    const { result } = renderHook(() => usePropertyFileUpload(), { wrapper: createQueryWrapper() });
    let ok = false;
    await act(async () => {
      ok = await result.current.upload({
        file: makeFile(),
        type: PropertyFileType.DOCUMENT,
        propertyId: 'p1',
        appointmentId: 'a1',
      });
    });
    expect(ok).toBe(true);
    // presign body
    expect(mockPost).toHaveBeenNthCalledWith(1, '/v1/property-files/presign', {
      body: {
        propertyId: 'p1',
        appointmentId: 'a1',
        type: 'DOCUMENT',
        fileName: 'doc.pdf',
        mime: 'application/pdf',
        sizeBytes: 1,
      },
    });
    // PUT with content-type
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://up/url',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } }),
    );
    // confirm carries an Idempotency-Key
    expect(mockPost).toHaveBeenNthCalledWith(2, '/v1/property-files/confirm', {
      body: { fileId: 'f1' },
      headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('surfaces a presign rejection (C.A5) and returns false', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'VALIDATION_ERROR', message: 'Unsupported file type' } },
      response: { status: 400 },
    });
    const { result } = renderHook(() => usePropertyFileUpload(), { wrapper: createQueryWrapper() });
    let ok = true;
    await act(async () => {
      ok = await result.current.upload({
        file: makeFile('x.exe', 'application/x-msdownload'),
        type: PropertyFileType.OTHER,
        propertyId: 'p1',
      });
    });
    expect(ok).toBe(false);
    expect(result.current.uploadError).toBe('Unsupported file type');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a 503 confirm to the shared storage message', async () => {
    mockPost
      .mockResolvedValueOnce({
        data: { data: { fileId: 'f1', uploadUrl: 'https://up/url', storageKey: 'k', expiresAt: 'e' } },
        error: undefined,
        response: { status: 201 },
      })
      .mockResolvedValueOnce({
        data: undefined,
        error: { error: { code: 'STORAGE_NOT_CONFIGURED', message: 'nope' } },
        response: { status: 503 },
      });
    fetchSpy.mockResolvedValue({ ok: true } as Response);

    const { result } = renderHook(() => usePropertyFileUpload(), { wrapper: createQueryWrapper() });
    await act(async () => {
      await result.current.upload({ file: makeFile(), type: PropertyFileType.REPORT, propertyId: 'p1' });
    });
    expect(result.current.uploadError).toBe(FILE_STORAGE_UNAVAILABLE_MESSAGE);
    expect(showError).toHaveBeenCalledWith(FILE_STORAGE_UNAVAILABLE_MESSAGE);
  });
});
