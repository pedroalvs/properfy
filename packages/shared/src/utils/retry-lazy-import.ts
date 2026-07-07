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

function safeGetItem(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // storage unavailable — nothing to clear
  }
}

/**
 * Handles stale chunk hashes after a new deployment: on the first import
 * failure it reloads the intended URL once; after that reload it retries the
 * import and lets a second failure surface to the caller (route error
 * boundary). The guard is cleared on success so each deployment gets its own
 * reload attempt. Storage failures (e.g. blocked sessionStorage) never mask
 * the import error; without a persistable guard the reload is skipped — a
 * reload that can't be marked as done could loop forever — and recovery falls
 * back to the single in-place retry.
 */
export async function retryLazyImportOnce<T>(
  importFn: () => Promise<T>,
  storage: StorageLike,
  location: LocationLike,
  logger: LoggerLike,
): Promise<T> {
  try {
    const module = await importFn();
    safeRemoveItem(storage, CHUNK_RELOAD_KEY);
    return module;
  } catch (error) {
    logger.error('Lazy route import failed', error);
    if (!safeGetItem(storage, CHUNK_RELOAD_KEY) && safeSetItem(storage, CHUNK_RELOAD_KEY, '1')) {
      location.replace(location.href); // reload the intended URL, bypassing the failed chunk
      return new Promise<T>(() => {}); // never resolves — page is reloading
    }
    safeRemoveItem(storage, CHUNK_RELOAD_KEY);
    return importFn(); // second attempt after reload; failure reaches the caller
  }
}
