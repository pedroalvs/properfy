import { PropertyFileType } from '@properfy/shared';

/**
 * The four Files subtabs. `issues` renders `PropertyIssue`s; the other three
 * render `PropertyFile`s of the matching `PropertyFileType` (F10 C.5/C.9).
 */
export type FileSubtab = 'issues' | 'documents' | 'reports' | 'other';

/** Subtabs in display order; Issues is the default (first). */
export const FILE_SUBTABS: readonly FileSubtab[] = [
  'issues',
  'documents',
  'reports',
  'other',
] as const;

export const SUBTAB_TO_TYPE: Record<FileSubtab, PropertyFileType> = {
  issues: PropertyFileType.ISSUE,
  documents: PropertyFileType.DOCUMENT,
  reports: PropertyFileType.REPORT,
  other: PropertyFileType.OTHER,
};

export const TYPE_TO_SUBTAB: Record<PropertyFileType, FileSubtab> = {
  [PropertyFileType.ISSUE]: 'issues',
  [PropertyFileType.DOCUMENT]: 'documents',
  [PropertyFileType.REPORT]: 'reports',
  [PropertyFileType.OTHER]: 'other',
};

export const SUBTAB_LABELS: Record<FileSubtab, string> = {
  issues: 'Issues',
  documents: 'Documents',
  reports: 'Reports',
  other: 'Other',
};

export function isSubtab(value: string): value is FileSubtab {
  return (FILE_SUBTABS as readonly string[]).includes(value);
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

/** HEIC/HEIF: accepted on upload, but browsers may not render it (D13). */
export function isHeicMime(mime: string): boolean {
  return mime === 'image/heic' || mime === 'image/heif';
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf';
}

/** True when the browser can render the file inline as an `<img>` (not HEIC). */
export function canPreviewInline(mime: string): boolean {
  return isImageMime(mime) && !isHeicMime(mime);
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human-readable byte size, e.g. `0 B`, `512 B`, `1.5 KB`, `20 MB`. */
export function humanizeSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unit]}`;
}
