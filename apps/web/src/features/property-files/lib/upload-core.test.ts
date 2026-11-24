import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { putToSignedUrl } from './upload-core';

const fetchSpy = vi.fn();

function makeFile(type = 'application/pdf') {
  return new File(['x'], 'doc.pdf', { type });
}

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('putToSignedUrl', () => {
  it('resolves on a 2xx storage response', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    await expect(putToSignedUrl('https://up/url', makeFile())).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the 415 storage status (bad type)', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 415 } as Response);
    await expect(putToSignedUrl('https://up/url', makeFile())).rejects.toMatchObject({
      status: 415,
    });
    await expect(putToSignedUrl('https://up/url', makeFile())).rejects.toBeInstanceOf(ApiError);
  });

  it('throws an ApiError carrying the 413 storage status (too large)', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 413 } as Response);
    await expect(putToSignedUrl('https://up/url', makeFile())).rejects.toMatchObject({
      status: 413,
    });
  });

  it('throws a timeout error when the request aborts', async () => {
    fetchSpy.mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    await expect(putToSignedUrl('https://up/url', makeFile())).rejects.toThrow('Upload timed out');
  });
});
