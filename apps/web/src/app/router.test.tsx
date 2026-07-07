import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryLazyImportOnce } from './router';

describe('retryLazyImportOnce', () => {
  const sessionStorageLike = {
    getItem: vi.fn((_: string) => null as string | null),
    setItem: vi.fn((_: string, __: string) => {}),
    removeItem: vi.fn((_: string) => {}),
  };
  const locationLike = {
    href: 'http://localhost:5173/appointments/apt-01',
    assign: vi.fn((_: string) => {}),
  };
  const logger = {
    error: vi.fn((_: unknown, ...__: unknown[]) => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageLike.getItem.mockReturnValue(null);
    locationLike.assign.mockImplementation(() => {});
  });

  it('reloads the current URL once after the first lazy import failure', async () => {
    const importFn = vi.fn(async () => {
      throw new Error('Loading chunk 123 failed');
    });
    locationLike.assign.mockImplementation(() => {
      throw new Error('reload-triggered');
    });

    await expect(
      retryLazyImportOnce(importFn, sessionStorageLike, locationLike, logger),
    ).rejects.toThrow('reload-triggered');

    expect(importFn).toHaveBeenCalledTimes(1);
    expect(sessionStorageLike.setItem).toHaveBeenCalledWith('chunk_reload', '1');
    expect(locationLike.assign).toHaveBeenCalledWith('http://localhost:5173/appointments/apt-01');
    expect(logger.error).toHaveBeenCalledWith('Lazy route import failed', expect.any(Error));
  });

  it('clears the retry guard and retries the import after a prior reload', async () => {
    sessionStorageLike.getItem.mockReturnValue('1');

    const module = { default: () => null };
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Loading chunk 123 failed'))
      .mockResolvedValueOnce(module);

    await expect(retryLazyImportOnce(importFn, sessionStorageLike, locationLike, logger)).resolves.toBe(module);

    expect(importFn).toHaveBeenCalledTimes(2);
    expect(sessionStorageLike.removeItem).toHaveBeenCalledWith('chunk_reload');
    expect(locationLike.assign).not.toHaveBeenCalled();
  });

  it('clears the retry guard on a successful import so a later failure can reload again', async () => {
    const module = { default: () => null };
    const importFn = vi.fn().mockResolvedValue(module);

    await expect(retryLazyImportOnce(importFn, sessionStorageLike, locationLike, logger)).resolves.toBe(module);

    expect(importFn).toHaveBeenCalledTimes(1);
    expect(sessionStorageLike.removeItem).toHaveBeenCalledWith('chunk_reload');
    expect(locationLike.assign).not.toHaveBeenCalled();
  });
});
