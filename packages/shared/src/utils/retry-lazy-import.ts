export const CHUNK_RELOAD_KEY = 'chunk_reload';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocationLike {
  href: string;
  replace(url: string): void;
}

export interface LoggerLike {
  error(message: string, ...args: unknown[]): void;
}

/**
 * Handles stale chunk hashes after a new deployment: on the first import
 * failure it reloads the intended URL once; after that reload it retries the
 * import and lets a second failure surface to the caller (route error
 * boundary). The guard is cleared on success so each deployment gets its own
 * reload attempt.
 */
export async function retryLazyImportOnce<T>(
  importFn: () => Promise<T>,
  storage: StorageLike,
  location: LocationLike,
  logger: LoggerLike,
): Promise<T> {
  try {
    const module = await importFn();
    storage.removeItem(CHUNK_RELOAD_KEY);
    return module;
  } catch (error) {
    logger.error('Lazy route import failed', error);
    if (!storage.getItem(CHUNK_RELOAD_KEY)) {
      storage.setItem(CHUNK_RELOAD_KEY, '1');
      location.replace(location.href); // reload the intended URL, bypassing the failed chunk
      return new Promise<T>(() => {}); // never resolves — page is reloading
    }
    storage.removeItem(CHUNK_RELOAD_KEY);
    return importFn(); // second attempt after reload; failure reaches the caller
  }
}
