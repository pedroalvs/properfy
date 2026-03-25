const LOCALE = 'en-AU';

/**
 * Parses an ISO string that incorrectly ends in 'Z' as if it were local time.
 * This is the lowest-risk fix for the backend's "fake UTC" implementation.
 */
function parseZAsLocal(iso: string): Date {
  if (!iso) return new Date();
  // Remove the 'Z' so the Date constructor treats it as local time
  const localIso = iso.endsWith('Z') ? iso.slice(0, -1) : iso;
  return new Date(localIso);
}

export function formatDate(iso: string): string {
  return parseZAsLocal(iso).toLocaleDateString(LOCALE);
}

export function formatDateTime(iso: string): string {
  return parseZAsLocal(iso).toLocaleString(LOCALE);
}

export function formatTime(iso: string): string {
  return parseZAsLocal(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns YYYY-MM-DD string in local time
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
