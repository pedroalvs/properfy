const LOCALE = 'en-AU';

export function formatDate(iso: string): string {
  // Always extract YYYY-MM-DD to avoid UTC-to-local offset shifts on datetime strings
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString(LOCALE);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE);
}

export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
