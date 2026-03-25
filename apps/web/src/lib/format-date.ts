const LOCALE = 'en-AU';

export function formatDate(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(LOCALE);
  }
  return new Date(iso).toLocaleDateString(LOCALE);
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
