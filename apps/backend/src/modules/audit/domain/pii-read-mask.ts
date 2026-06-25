/**
 * Feature 020 FR-025: audience-aware read-time masking primitives for audit
 * log responses.
 *
 * Three tiers:
 *   - AM: raw value (no masking applied to un-redacted entries)
 *   - OP: partial masking
 *       - email:  first 3 chars + '***@' + domain  (use***@example.com)
 *       - phone:  '***' + last 4 digits             (***9999)
 *       - name:   first-initial '.' + last-initial '.' (J. D.)
 *   - CL_ADMIN: blanket '[MASKED]' for any PII field
 *
 * Already-redacted entries (with `redaction_status = FULL`) bypass these
 * functions entirely — see list-audit-logs.use-case.ts. Read-time masking
 * never applies on top of `[REDACTED]`.
 *
 * Pure functions, no dependencies. Null / undefined / empty inputs pass
 * through unchanged for graceful degradation.
 */

export type AuditReaderRole = 'AM' | 'OP' | 'CL_ADMIN';

const MASKED_SENTINEL = '[MASKED]';

function unchanged(value: unknown): unknown {
  return value;
}

export function maskEmail(value: unknown, role: AuditReaderRole): unknown {
  if (value === null || value === undefined) return unchanged(value);
  if (typeof value !== 'string' || value.length === 0) return unchanged(value);
  if (role === 'AM') return value;
  if (role === 'CL_ADMIN') return MASKED_SENTINEL;

  // OP: first 3 chars + '***@' + domain
  const atIdx = value.indexOf('@');
  if (atIdx < 0) {
    // Not a conventional email — partially mask anyway
    const visible = value.slice(0, Math.min(3, value.length));
    return `${visible}***`;
  }
  const local = value.slice(0, atIdx);
  const domain = value.slice(atIdx);
  const visibleLocal = local.slice(0, Math.min(3, local.length));
  return `${visibleLocal}***${domain}`;
}

export function maskPhone(value: unknown, role: AuditReaderRole): unknown {
  if (value === null || value === undefined) return unchanged(value);
  if (typeof value !== 'string' || value.length === 0) return unchanged(value);
  if (role === 'AM') return value;
  if (role === 'CL_ADMIN') return MASKED_SENTINEL;

  // OP: '***' + last 4 digits (digits only; extract from formatted strings)
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return '***';
  }
  return `***${digitsOnly.slice(-4)}`;
}

export function maskName(value: unknown, role: AuditReaderRole): unknown {
  if (value === null || value === undefined) return unchanged(value);
  if (typeof value !== 'string' || value.length === 0) return unchanged(value);
  if (role === 'AM') return value;
  if (role === 'CL_ADMIN') return MASKED_SENTINEL;

  // OP: first-initial '.' + last-initial '.'
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return unchanged(value);
  if (parts.length === 1) {
    const first = parts[0]!;
    return `${first.charAt(0).toUpperCase()}.`;
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first.charAt(0).toUpperCase()}. ${last.charAt(0).toUpperCase()}.`;
}
