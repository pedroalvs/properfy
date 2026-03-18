const LOCALE = 'en-AU';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE);
}
