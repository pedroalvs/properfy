import type { RawImportRow } from './appointment-import-normalize';

/**
 * Which spreadsheet columns the appointment import understands, and what it
 * does when one is missing or misspelled. This is business policy, not a file
 * format detail, so it lives in the domain — the parser (infrastructure) reads
 * bytes and asks this module what the headers mean.
 */

/**
 * Exact spreadsheet header (trimmed) -> internal field name. Everything NOT
 * in this map is either a dynamic `CUSTOM: {name}` candidate (see
 * `CUSTOM_HEADER_RE`) or an unknown column, reported as a warning.
 */
export const APPOINTMENT_IMPORT_HEADER_MAP: Record<string, Exclude<keyof RawImportRow, 'customFieldCandidates'>> = {
  'Type': 'serviceTypeName',
  'Date': 'scheduledDate',
  'Start Time': 'timeSlotStart',
  'End Time': 'timeSlotEnd',
  'Street': 'street',
  'Suburb': 'suburb',
  'State': 'state',
  'Postcode': 'postcode',
  'Country': 'country',
  'Address line 2': 'addressLine2',
  'Apartment': 'apartmentNumber',
  'Notes': 'notes',
  'Realty description': 'realtyDescription',
  'Tenant name': 'primaryContactName',
  'Tenant mail': 'primaryContactEmail',
  'Tenant phone': 'primaryContactPhone',
  'EMAIL: Tenant secondary mail': 'secondaryEmail',
  'PHONE: Tenant secondary phone': 'secondaryPhone',
  'EMAIL: Tenant tertiary mail': 'tertiaryEmail',
  'PHONE: Tenant tertiary phone': 'tertiaryPhone',
  'EMAIL: Tenant quaternary mail': 'quaternaryEmail',
  'PHONE: Tenant quaternary phone': 'quaternaryPhone',
};

/** Any header not in the static map matching this becomes a custom-field
 * candidate — this is how the real sample file's own `CUSTOM: Complete
 * Property Address` column is picked up with zero special-casing, and how
 * an agency can add up to 4 (see CUSTOM_FIELDS_MAX) of their own. */
export const CUSTOM_HEADER_RE = /^CUSTOM:\s*(.+)$/i;

/**
 * Columns whose absence blocks the import. Date / Start Time / End Time are
 * deliberately absent: the normalizer applies documented defaults for them
 * (`scheduledDateDefaulted` / `timeDefaulted`), so a file without them still
 * imports correctly. Everything listed here produces a hard per-row error when
 * empty, so a missing column would otherwise degrade into one identical error
 * per row instead of a single "this column is missing".
 */
export const REQUIRED_IMPORT_COLUMNS = ['Type', 'Street', 'Suburb', 'State', 'Postcode'] as const;

export interface UnknownImportColumn {
  column: string;
  /** Closest recognized header when the two are near enough to be a typo. */
  suggestion: string | null;
}

export interface HeaderAnalysis {
  /** Trimmed headers matching the static map exactly, in column order. */
  recognized: string[];
  /** Labels of `CUSTOM: x` headers, in column order. */
  custom: string[];
  /** Neither mapped nor CUSTOM:, in column order, with a did-you-mean. */
  unknown: UnknownImportColumn[];
  /** Subset of REQUIRED_IMPORT_COLUMNS with no exact header match, in the
   * order they are declared above. */
  missingRequired: string[];
}

/** Iterative two-row Levenshtein. Small enough not to warrant a dependency,
 * and only ever run over a single header row. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

const isRequired = (header: string): boolean =>
  (REQUIRED_IMPORT_COLUMNS as readonly string[]).includes(header);

/**
 * Closest recognized header, or null when nothing is close enough to be worth
 * suggesting. Compared case-insensitively so a miscased header suggests its
 * correct casing — we suggest only, and never auto-map, because auto-mapping
 * would silently change the exact-match contract the header map documents.
 *
 * A wrong guess is worse than none: it sits right next to a missing-columns
 * error and sends the user to rename the wrong thing. Hence two rules —
 * short headers get no slack (edit-distance 2 out of 4 characters is a
 * different word, not a typo: "Name" is not "Date"), and ties go to a required
 * column rather than to whichever happens to be declared first ("Sate" is one
 * edit from both "Date" and "State"; only one of those is plausible).
 */
function nearestHeader(input: string): string | null {
  const needle = input.toLowerCase();
  const tolerance = needle.length <= 4 ? 1 : Math.max(2, Math.floor(needle.length / 4));

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of Object.keys(APPOINTMENT_IMPORT_HEADER_MAP)) {
    const distance = levenshtein(needle, candidate.toLowerCase());
    const closer = distance < bestDistance;
    const betterTie = distance === bestDistance && isRequired(candidate) && !isRequired(best ?? '');
    if (closer || betterTie) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return bestDistance <= tolerance ? best : null;
}

export function analyzeImportHeaders(headers: readonly string[]): HeaderAnalysis {
  const recognized: string[] = [];
  const custom: string[] = [];
  const unknown: UnknownImportColumn[] = [];

  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;

    if (APPOINTMENT_IMPORT_HEADER_MAP[trimmed]) {
      recognized.push(trimmed);
      continue;
    }
    const customMatch = CUSTOM_HEADER_RE.exec(trimmed);
    if (customMatch) {
      custom.push(customMatch[1]!.trim());
      continue;
    }
    unknown.push({ column: trimmed, suggestion: nearestHeader(trimmed) });
  }

  const missingRequired = REQUIRED_IMPORT_COLUMNS.filter((column) => !recognized.includes(column));

  return { recognized, custom, unknown, missingRequired };
}

/**
 * Whether a row looks like a header row rather than data or a cover sheet.
 * Used only to choose which worksheet to read.
 *
 * Deliberately lenient — one required column, or two recognized ones, is
 * enough. A sheet whose headers are half-renamed must still be selected so the
 * user gets a precise missing-columns message about the sheet they meant,
 * instead of the parser skipping past it to an instructions tab.
 */
export function isRecognizableHeaderRow(headers: readonly string[]): boolean {
  const { recognized } = analyzeImportHeaders(headers);
  if (recognized.length >= 2) return true;
  return recognized.some((header) => (REQUIRED_IMPORT_COLUMNS as readonly string[]).includes(header));
}
