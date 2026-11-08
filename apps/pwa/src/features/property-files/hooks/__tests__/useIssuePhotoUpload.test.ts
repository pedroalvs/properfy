import { renderHook, act, waitFor } from '@testing-library/react';
import { ApiError } from '@properfy/shared';
import { useIssuePhotoUpload } from '../useIssuePhotoUpload';

let idemCounter = 0;
vi.mock('@/lib/idempotency', () => ({ generateIdempotencyKey: () => `id-${++idemCounter}` }));

const mockApiPost = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ apiPost: (...args: unknown[]) => mockApiPost(...args) }));

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

describe('useIssuePhotoUpload', () => {
  beforeEach(() => {
    idemCounter = 0;
    let fileCounter = 0;
    mockApiPost.mockReset();
    mockApiPost.mockImplementation((path: string, body: { fileName?: string }) => {
      if (path === '/v1/property-files/presign') {
        if (body.fileName === 'bad.jpg') return Promise.reject(new ApiError(500, 'boom', 'INTERNAL_ERROR'));
        fileCounter += 1;
        return Promise.resolve({
          data: { fileId: `file-${fileCounter}`, uploadUrl: `https://signed/${fileCounter}`, storageKey: 'k', expiresAt: 'e' },
        });
      }
      if (path === '/v1/property-files/confirm') return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    // @ts-expect-error jsdom lacks object-URL helpers
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    // @ts-expect-error jsdom lacks object-URL helpers
    global.URL.revokeObjectURL = vi.fn();
  });

  it('presigns → PUTs → confirms (with Idempotency-Key); photo ends confirmed with a fileId', async () => {
    const { result } = renderHook(() => useIssuePhotoUpload({ propertyId: 'p1', appointmentId: 'apt-1' }));

    await act(async () => {
      result.current.addPhoto(imageFile('a.jpg'));
    });
    await waitFor(() => expect(result.current.photos[0]?.status).toBe('confirmed'));

    expect(global.fetch).toHaveBeenCalledWith('https://signed/1', expect.objectContaining({ method: 'PUT' }));
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/property-files/confirm',
      { fileId: 'file-1' },
      { 'Idempotency-Key': expect.any(String) },
    );
    expect(result.current.confirmedFileIds).toEqual(['file-1']);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.hasFailed).toBe(false);
  });

  it('keeps the confirmed photo when another photo fails (failure isolation, D12)', async () => {
    const { result } = renderHook(() => useIssuePhotoUpload({ propertyId: 'p1', appointmentId: 'apt-1' }));

    await act(async () => {
      result.current.addPhoto(imageFile('a.jpg'));
    });
    await waitFor(() => expect(result.current.photos[0]?.status).toBe('confirmed'));
    await act(async () => {
      result.current.addPhoto(imageFile('bad.jpg'));
    });
    await waitFor(() => expect(result.current.photos[1]?.status).toBe('failed'));

    expect(result.current.photos[0]?.status).toBe('confirmed');
    expect(result.current.confirmedFileIds).toEqual(['file-1']);
    expect(result.current.hasFailed).toBe(true);
    expect(result.current.photos[1]?.error).toBeTruthy();
  });

  it('retries a failed photo', async () => {
    const { result } = renderHook(() => useIssuePhotoUpload({ propertyId: 'p1', appointmentId: 'apt-1' }));
    await act(async () => {
      result.current.addPhoto(imageFile('bad.jpg'));
    });
    await waitFor(() => expect(result.current.photos[0]?.status).toBe('failed'));

    // Make the previously-failing name succeed on retry.
    mockApiPost.mockImplementation((path: string) => {
      if (path === '/v1/property-files/presign') {
        return Promise.resolve({ data: { fileId: 'file-retry', uploadUrl: 'https://signed/r', storageKey: 'k', expiresAt: 'e' } });
      }
      return Promise.resolve({ data: {} });
    });
    const localId = result.current.photos[0]!.localId;
    await act(async () => {
      result.current.retryPhoto(localId);
    });
    await waitFor(() => expect(result.current.photos[0]?.status).toBe('confirmed'));
    expect(result.current.confirmedFileIds).toEqual(['file-retry']);
  });

  it('removes a photo and revokes its object URL', async () => {
    const { result } = renderHook(() => useIssuePhotoUpload({ propertyId: 'p1', appointmentId: 'apt-1' }));
    await act(async () => {
      result.current.addPhoto(imageFile('a.jpg'));
    });
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    const localId = result.current.photos[0]!.localId;

    await act(async () => {
      result.current.removePhoto(localId);
    });
    expect(result.current.photos).toHaveLength(0);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('rejects a non-image file with a soft message and uploads nothing', async () => {
    const { result } = renderHook(() => useIssuePhotoUpload({ propertyId: 'p1', appointmentId: 'apt-1' }));
    await act(async () => {
      result.current.addPhoto(new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' }));
    });
    expect(result.current.photos).toHaveLength(0);
    expect(result.current.addError).toMatch(/image files/i);
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
