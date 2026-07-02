import { HHMM_REGEX } from '@properfy/shared';
import type { ImportRowIssue } from '@properfy/shared';
import {
  CUSTOM_FIELD_LABEL_MAX,
  CUSTOM_FIELD_VALUE_MAX,
  CUSTOM_FIELDS_MAX,
} from '@properfy/shared';

/**
 * Pure normalization for the appointment-import row resolver. No DB access,
 * no I/O — takes whatever a spreadsheet cell literally contains (a type-
 * preserving parse result; see the infrastructure parser) and produces
 * clean, defaulted values plus every warning generated along the way.
 * Required-field ERRORS (missing service type, incomplete contact, etc.)
 * are NOT decided here — that needs DB lookups and belongs to the resolver.
 * This layer only ever produces `warning`-severity issues.
 */

/** A cell value as it comes out of the parser, before any normalization.
 * `Date`/`number` matter for scheduledDate (Excel serial vs date-typed cell)
 * and for phone/postcode (numeric storage strips a leading AU `0`). */
export type RawCell = string | number | Date | null | undefined;

export interface RawCustomFieldCandidate {
  label: string;
  rawValue: RawCell;
}

/** Raw parsed row, already keyed by internal field name (the parser owns the
 * spreadsheet-header → internal-field mapping, including the dynamic
 * `CUSTOM: {name}` → customFieldCandidates rule). */
export interface RawImportRow {
  serviceTypeName: RawCell;
  scheduledDate: RawCell;
  timeSlotStart: RawCell;
  timeSlotEnd: RawCell;
  street: RawCell;
  addressLine2: RawCell;
  suburb: RawCell;
  state: RawCell;
  postcode: RawCell;
  country: RawCell;
  notes: RawCell;
  realtyDescription: RawCell;
  primaryContactName: RawCell;
  primaryContactEmail: RawCell;
  primaryContactPhone: RawCell;
  secondaryEmail: RawCell;
  secondaryPhone: RawCell;
  tertiaryEmail: RawCell;
  tertiaryPhone: RawCell;
  quaternaryEmail: RawCell;
  quaternaryPhone: RawCell;
  customFieldCandidates: RawCustomFieldCandidate[];
}

export interface NormalizedContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  /** True when `name` was derived from the email local-part because no name
   * was supplied (decision: maximize importable rows). */
  nameDerived: boolean;
}

export interface NormalizedAdditionalChannelCandidate {
  channel: 'EMAIL' | 'PHONE';
  value: string;
  label: 'Secondary' | 'Tertiary' | 'Quaternary';
}

export interface NormalizedCustomField {
  label: string;
  value: string;
}

export interface NormalizedRow {
  serviceTypeName: string | null;
  scheduledDate: string;
  scheduledDateDefaulted: boolean;
  timeSlotStart: string;
  timeSlotEnd: string;
  timeDefaulted: boolean;
  street: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  notes: string | null;
  primaryContact: NormalizedContact;
  additionalChannelCandidates: NormalizedAdditionalChannelCandidate[];
  customFields: NormalizedCustomField[];
  customFieldsTruncated: boolean;
}

function trimOrNull(raw: RawCell): string | null {
  if (raw == null) return null;
  const str = raw instanceof Date ? raw.toISOString() : String(raw).trim();
  return str === '' ? null : str;
}

function toDateOnlyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Excel's 1900 date system: serial 1 = 1900-01-01. Using the 1899-12-30
 * epoch (instead of 1899-12-31) absorbs Excel's fake-1900-leap-year bug for
 * every realistic modern date (serial ≥ 61). */
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

export function normalizeScheduledDate(
  raw: RawCell,
  importDayDate: string,
): { date: string; defaulted: boolean } {
  if (raw instanceof Date) {
    return { date: toDateOnlyUTC(raw), defaulted: false };
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return { date: toDateOnlyUTC(new Date(EXCEL_EPOCH_UTC_MS + raw * 86_400_000)), defaulted: false };
  }
  const trimmed = trimOrNull(raw);
  if (trimmed && ISO_DATE_RE.test(trimmed)) {
    return { date: trimmed, defaulted: false };
  }
  return { date: importDayDate, defaulted: true };
}

function timeFromRawCell(raw: RawCell): string | null {
  if (raw instanceof Date) {
    const hh = String(raw.getUTCHours()).padStart(2, '0');
    const mm = String(raw.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const trimmed = trimOrNull(raw);
  if (trimmed && HHMM_REGEX.test(trimmed)) return trimmed;
  return null;
}

export function normalizeTimeSlot(
  startRaw: RawCell,
  endRaw: RawCell,
): { start: string; end: string; defaulted: boolean } {
  const start = timeFromRawCell(startRaw);
  const end = timeFromRawCell(endRaw);
  if (start && end && start < end) {
    return { start, end, defaulted: false };
  }
  return { start: '08:00', end: '17:00', defaulted: true };
}

export function normalizePostcode(raw: RawCell): string | null {
  const trimmed = trimOrNull(raw);
  if (!trimmed) return null;
  // AU postcodes are always 4 digits (NT/ACT can start with 0); numeric
  // storage (this feature's whole reason for existing) strips leading zeros.
  return /^\d+$/.test(trimmed) ? trimmed.padStart(4, '0') : trimmed;
}

export function normalizePhoneAU(raw: RawCell): { value: string | null; normalized: boolean } {
  const trimmed = trimOrNull(raw);
  if (!trimmed) return { value: null, normalized: false };
  const digits = trimmed.replace(/\D/g, '');

  if (digits.startsWith('61') && (digits.length === 10 || digits.length === 11)) {
    return { value: `0${digits.slice(2)}`, normalized: true };
  }
  if (digits.length === 9) {
    // Numeric-cell storage drops the leading 0 on both mobiles (04xxxxxxxx)
    // and landlines (0Xxxxxxxxx) alike — restore it either way.
    return { value: `0${digits}`, normalized: true };
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return { value: digits, normalized: false };
  }
  // Unrecognized shape — best-effort passthrough, no forced change.
  return { value: digits || trimmed, normalized: false };
}

export function deriveContactNameFromEmail(email: RawCell): string | null {
  const trimmed = trimOrNull(email);
  if (!trimmed || !trimmed.includes('@')) return null;
  const localPart = trimmed.split('@')[0]!;
  const words = localPart.split(/[._+-]+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function issue(field: string, code: string, severity: 'warning' | 'error', message: string): ImportRowIssue {
  return { field, code, severity, message };
}

interface ChannelPairInput {
  label: 'Secondary' | 'Tertiary' | 'Quaternary';
  emailRaw: RawCell;
  phoneRaw: RawCell;
}

function buildAdditionalChannels(
  primaryEmail: string | null,
  primaryPhone: string | null,
  pairs: ChannelPairInput[],
): { channels: NormalizedAdditionalChannelCandidate[]; issues: ImportRowIssue[] } {
  const channels: NormalizedAdditionalChannelCandidate[] = [];
  const issues: ImportRowIssue[] = [];
  const seen = new Set<string>();

  for (const pair of pairs) {
    const email = trimOrNull(pair.emailRaw);
    const phoneResult = normalizePhoneAU(pair.phoneRaw);
    const phone = phoneResult.value;

    if (email && phone) {
      issues.push(issue('additionalChannels', 'CONTACT_PARTIAL', 'warning',
        `${pair.label} email and phone both present but stored as separate channels`));
    } else if ((email && !phone) || (!email && phone)) {
      issues.push(issue('additionalChannels', 'CONTACT_PARTIAL', 'warning',
        `${pair.label} contact has only ${email ? 'an email' : 'a phone'} — the other is missing`));
    }
    if (phoneResult.normalized) {
      issues.push(issue('additionalChannels', 'PHONE_NORMALIZED', 'warning',
        `${pair.label} phone re-padded to ${phone}`));
    }

    if (email) {
      if (primaryEmail && email === primaryEmail) {
        issues.push(issue('additionalChannels', 'CHANNEL_DUPLICATES_PRIMARY', 'warning',
          `${pair.label} email duplicates the primary contact's email — dropped`));
      } else if (seen.has(`EMAIL:${email}`)) {
        issues.push(issue('additionalChannels', 'CHANNEL_DUPLICATE', 'warning',
          `${pair.label} email duplicates an earlier channel on this row — dropped`));
      } else {
        seen.add(`EMAIL:${email}`);
        channels.push({ channel: 'EMAIL', value: email, label: pair.label });
      }
    }
    if (phone) {
      if (primaryPhone && phone === primaryPhone) {
        issues.push(issue('additionalChannels', 'CHANNEL_DUPLICATES_PRIMARY', 'warning',
          `${pair.label} phone duplicates the primary contact's phone — dropped`));
      } else if (seen.has(`PHONE:${phone}`)) {
        issues.push(issue('additionalChannels', 'CHANNEL_DUPLICATE', 'warning',
          `${pair.label} phone duplicates an earlier channel on this row — dropped`));
      } else {
        seen.add(`PHONE:${phone}`);
        channels.push({ channel: 'PHONE', value: phone, label: pair.label });
      }
    }
  }

  return { channels, issues };
}

function buildCustomFields(
  candidates: RawCustomFieldCandidate[],
): { fields: NormalizedCustomField[]; truncated: boolean; issues: ImportRowIssue[] } {
  const issues: ImportRowIssue[] = [];
  const valid: NormalizedCustomField[] = [];

  for (const candidate of candidates) {
    const rawLabel = trimOrNull(candidate.label);
    const rawValue = trimOrNull(candidate.rawValue);
    if (!rawLabel || !rawValue) continue; // schema requires a non-empty value (and we require a label too)

    const label = rawLabel.slice(0, CUSTOM_FIELD_LABEL_MAX);
    const value = rawValue.slice(0, CUSTOM_FIELD_VALUE_MAX);
    if (label.length < rawLabel.length || value.length < rawValue.length) {
      issues.push(issue('customFields', 'CUSTOM_FIELD_TRUNCATED', 'warning',
        `Custom field "${label}" was truncated to fit the ${CUSTOM_FIELD_LABEL_MAX}/${CUSTOM_FIELD_VALUE_MAX} character limits`));
    }
    valid.push({ label, value });
  }

  const truncated = valid.length > CUSTOM_FIELDS_MAX;
  if (truncated) {
    issues.push(issue('customFields', 'CUSTOM_FIELDS_TRUNCATED', 'warning',
      `More than ${CUSTOM_FIELDS_MAX} custom-field columns found; only the first ${CUSTOM_FIELDS_MAX} were imported`));
  }

  return { fields: valid.slice(0, CUSTOM_FIELDS_MAX), truncated, issues };
}

export function normalizeImportRow(
  raw: RawImportRow,
  importDayDate: string,
): { normalized: NormalizedRow; issues: ImportRowIssue[] } {
  const issues: ImportRowIssue[] = [];

  const dateResult = normalizeScheduledDate(raw.scheduledDate, importDayDate);
  if (dateResult.defaulted) {
    issues.push(issue('scheduledDate', 'DEFAULT_APPLIED_DATE', 'warning',
      `Date empty or unparseable; defaulted to today (${dateResult.date})`));
  }

  const timeResult = normalizeTimeSlot(raw.timeSlotStart, raw.timeSlotEnd);
  if (timeResult.defaulted) {
    issues.push(issue('timeSlot', 'DEFAULT_APPLIED_TIME', 'warning',
      'Time empty or invalid; defaulted to 08:00–17:00'));
  }

  const primaryEmail = trimOrNull(raw.primaryContactEmail);
  const primaryPhoneResult = normalizePhoneAU(raw.primaryContactPhone);
  if (primaryPhoneResult.normalized) {
    issues.push(issue('primaryContactPhone', 'PHONE_NORMALIZED', 'warning',
      `Primary contact phone re-padded to ${primaryPhoneResult.value}`));
  }

  let primaryName = trimOrNull(raw.primaryContactName);
  let nameDerived = false;
  if (!primaryName && primaryEmail) {
    primaryName = deriveContactNameFromEmail(primaryEmail);
    if (primaryName) {
      nameDerived = true;
      issues.push(issue('primaryContactName', 'CONTACT_NAME_DERIVED', 'warning',
        `Contact name derived from email (${primaryEmail}) — no name was given`));
    }
  }

  const { channels, issues: channelIssues } = buildAdditionalChannels(primaryEmail, primaryPhoneResult.value, [
    { label: 'Secondary', emailRaw: raw.secondaryEmail, phoneRaw: raw.secondaryPhone },
    { label: 'Tertiary', emailRaw: raw.tertiaryEmail, phoneRaw: raw.tertiaryPhone },
    { label: 'Quaternary', emailRaw: raw.quaternaryEmail, phoneRaw: raw.quaternaryPhone },
  ]);
  issues.push(...channelIssues);

  const { fields, truncated, issues: customFieldIssues } = buildCustomFields(raw.customFieldCandidates);
  issues.push(...customFieldIssues);

  const notes = trimOrNull(raw.notes);
  const realtyDescription = trimOrNull(raw.realtyDescription);
  const combinedNotes = [notes, realtyDescription ? `Realty description: ${realtyDescription}` : null]
    .filter((v): v is string => v != null)
    .join('\n\n') || null;

  const normalized: NormalizedRow = {
    serviceTypeName: trimOrNull(raw.serviceTypeName),
    scheduledDate: dateResult.date,
    scheduledDateDefaulted: dateResult.defaulted,
    timeSlotStart: timeResult.start,
    timeSlotEnd: timeResult.end,
    timeDefaulted: timeResult.defaulted,
    street: trimOrNull(raw.street),
    addressLine2: trimOrNull(raw.addressLine2),
    suburb: trimOrNull(raw.suburb),
    state: trimOrNull(raw.state),
    postcode: normalizePostcode(raw.postcode),
    country: trimOrNull(raw.country) ?? 'AU',
    notes: combinedNotes,
    primaryContact: {
      name: primaryName,
      email: primaryEmail,
      phone: primaryPhoneResult.value,
      nameDerived,
    },
    additionalChannelCandidates: channels,
    customFields: fields,
    customFieldsTruncated: truncated,
  };

  return { normalized, issues };
}
