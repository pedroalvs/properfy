const STORAGE_KEY = 'properfy:web:post-login-redirect';

function isSafeRedirect(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')) return false;
  if (path === '/rental-tenant-portal' || path.startsWith('/rental-tenant-portal/') || path === '/tenant-portal' || path.startsWith('/tenant-portal/') || path.startsWith('/portal/')) return false;
  return true;
}

export function buildCurrentRedirectTarget(locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): string {
  return `${locationLike.pathname}${locationLike.search}${locationLike.hash}`;
}

export function savePostLoginRedirect(path: string): void {
  if (typeof window === 'undefined') return;
  if (!isSafeRedirect(path)) return;
  window.sessionStorage.setItem(STORAGE_KEY, path);
}

export function readPostLoginRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return isSafeRedirect(value) ? value : null;
}

export function consumePostLoginRedirect(): string | null {
  const value = readPostLoginRedirect();
  clearPostLoginRedirect();
  return value;
}

export function clearPostLoginRedirect(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
