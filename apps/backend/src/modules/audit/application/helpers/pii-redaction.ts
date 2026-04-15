/**
 * PII redaction helper for audit snapshots.
 *
 * Masks PII fields at WRITE time (irreversible) to avoid storing
 * personal data in audit logs.
 */

const REDACTED = '[REDACTED]';

/**
 * Registry of (action prefix, field path) pairs considered PII.
 * Field paths use dot notation for nested objects.
 */
interface PiiRule {
  /** Action prefix to match (empty string matches all actions). */
  actionPrefix: string;
  /** Dot-separated field path within the JSON snapshot. */
  fieldPath: string;
}

const PII_REGISTRY: PiiRule[] = [
  // User and inspector actions
  { actionPrefix: 'user.', fieldPath: 'email' },
  { actionPrefix: 'user.', fieldPath: 'phone' },
  { actionPrefix: 'user.', fieldPath: 'name' },
  { actionPrefix: 'inspector.', fieldPath: 'email' },
  { actionPrefix: 'inspector.', fieldPath: 'phone' },
  { actionPrefix: 'inspector.', fieldPath: 'name' },
  { actionPrefix: 'auth.', fieldPath: 'email' },
  { actionPrefix: 'auth.', fieldPath: 'phone' },
  { actionPrefix: 'auth.', fieldPath: 'name' },

  // Tenant portal actions
  { actionPrefix: 'portal.', fieldPath: 'primaryEmail' },
  { actionPrefix: 'portal.', fieldPath: 'primaryPhone' },
  { actionPrefix: 'portal.', fieldPath: 'email' },
  { actionPrefix: 'portal.', fieldPath: 'phone' },
  { actionPrefix: 'portal.', fieldPath: 'name' },

  // Appointment contact updates
  { actionPrefix: 'appointment.', fieldPath: 'contact.tenantName' },
  { actionPrefix: 'appointment.', fieldPath: 'contact.primaryEmail' },
  { actionPrefix: 'appointment.', fieldPath: 'contact.primaryPhone' },
  { actionPrefix: 'appointment.', fieldPath: 'tenantName' },
  { actionPrefix: 'appointment.', fieldPath: 'tenantEmail' },
  { actionPrefix: 'appointment.', fieldPath: 'tenantPhone' },
];

/**
 * Returns the set of field paths that should be redacted for the given action.
 */
function getPiiFieldPaths(action: string): string[] {
  const paths: string[] = [];
  for (const rule of PII_REGISTRY) {
    if (rule.actionPrefix === '' || action.startsWith(rule.actionPrefix)) {
      paths.push(rule.fieldPath);
    }
  }
  return paths;
}

/**
 * Sets a value at a dot-separated path within an object, if the path exists.
 * Only replaces existing values; does not create new keys.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 0) return;

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      return; // Path does not exist, nothing to redact
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  if (lastPart in current && current[lastPart] !== undefined && current[lastPart] !== null) {
    current[lastPart] = value;
  }
}

/**
 * Redacts PII fields in a JSON snapshot based on the audit action.
 *
 * Returns a deep-cloned snapshot with PII fields replaced by `[REDACTED]`.
 * If the snapshot is null/undefined, returns it as-is.
 * Unknown actions pass through without redaction.
 *
 * @deprecated Feature 020 reversed write-time PII destruction. Use
 * {@link redactByFieldPath} for on-demand erasure workflows and let
 * `ListAuditLogsUseCase` apply read-time masking via `pii-read-mask.ts`.
 * This function is kept for compatibility with pre-020 call sites and the
 * legacy action-prefix registry tests.
 */
export function redactPii(action: string, snapshot: unknown): unknown {
  if (snapshot === null || snapshot === undefined) {
    return snapshot;
  }

  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot;
  }

  const fieldPaths = getPiiFieldPaths(action);
  if (fieldPaths.length === 0) {
    return snapshot;
  }

  // Deep clone to avoid mutating the original
  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

  for (const path of fieldPaths) {
    setNestedValue(cloned, path, REDACTED);
  }

  return cloned;
}

// ─── Feature 020: on-demand redaction primitives ──────────────────────────

/**
 * Classification of a PII field path — drives how {@link redactByFieldPath}
 * treats the value.
 *
 * - `direct`: replace just the leaf value with `[REDACTED]` (e.g., `user.email`)
 * - `sensitive_financial`: replace the entire field's value with `[REDACTED]`,
 *   regardless of whether it's a scalar or a nested object. Used for opaque
 *   blobs like `paymentSettingsJson` where we cannot safely preserve any
 *   internal structure.
 * - `unstructured`: manual review required. The function does NOT mutate the
 *   snapshot but returns a flagged list so the caller can surface these for
 *   human inspection (e.g., `appointment.customFieldsJson`).
 */
export type PiiClassification = 'direct' | 'sensitive_financial' | 'unstructured';

export interface PiiFieldPathSpec {
  path: string;
  classification: PiiClassification;
}

export interface RedactByFieldPathResult {
  redacted: unknown;
  /** Paths that were skipped for manual review (classification = `unstructured`). */
  flaggedForReview: string[];
}

/**
 * On-demand redaction helper used by the data-subject erasure workflow.
 *
 * Given a JSON snapshot and a list of typed field paths, returns a deep-clone
 * where each `direct` path has its leaf value replaced and each
 * `sensitive_financial` path has its entire value replaced. `unstructured`
 * paths are reported in `flaggedForReview` so the caller can surface them to
 * an operator without mutating the snapshot.
 *
 * Null / undefined / non-object snapshots pass through unchanged.
 */
export function redactByFieldPath(
  snapshot: unknown,
  paths: PiiFieldPathSpec[],
): RedactByFieldPathResult {
  if (snapshot === null || snapshot === undefined) {
    return { redacted: snapshot, flaggedForReview: [] };
  }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { redacted: snapshot, flaggedForReview: [] };
  }

  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  const flaggedForReview: string[] = [];

  for (const spec of paths) {
    if (spec.classification === 'unstructured') {
      if (pathExists(cloned, spec.path)) {
        flaggedForReview.push(spec.path);
      }
      continue;
    }
    // Both `direct` and `sensitive_financial` replace the leaf with [REDACTED].
    // The opaque-block behavior is natural: when `paymentSettingsJson` is a
    // top-level field and the spec's path is just `paymentSettingsJson`, the
    // whole object gets replaced. When a nested path targets a scalar inside
    // an object, only that scalar is replaced.
    setNestedValue(cloned, spec.path, REDACTED);
  }

  return { redacted: cloned, flaggedForReview };
}

/** Returns true when the dotted path resolves to a defined, non-null value. */
function pathExists(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined && current !== null;
}
