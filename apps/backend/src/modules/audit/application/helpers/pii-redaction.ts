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
