import { getErrorMessage, getFieldErrors } from '@properfy/shared';

export interface ServerFieldErrorsResult<K extends string> {
  /** Backend validation details matched to form field keys. */
  fieldErrors?: Partial<Record<K, string>>;
  /**
   * Summary message for the snackbar. Present when no detail matched a form
   * field, or when some details had no matching field (so nothing is lost).
   */
  error?: string;
}

/**
 * Split a backend `VALIDATION_ERROR` envelope (`details: [{ field, message }]`,
 * where `field` is a dotted Zod path like `contact.rentalTenantName`) into
 * inline form field errors plus an optional summary message.
 */
export function mapServerFieldErrors<K extends string>(
  err: unknown,
  mapPath: (path: string) => K | undefined,
  fallbackMessage: string,
): ServerFieldErrorsResult<K> {
  const details = getFieldErrors(err);
  const fieldErrors: Partial<Record<K, string>> = {};
  let unmatched = false;
  for (const [path, message] of Object.entries(details)) {
    const key = mapPath(path);
    if (key !== undefined) {
      if (fieldErrors[key] === undefined) fieldErrors[key] = message;
    } else {
      unmatched = true;
    }
  }
  const matched = Object.keys(fieldErrors).length > 0;
  return {
    ...(matched ? { fieldErrors } : {}),
    ...(!matched || unmatched ? { error: getErrorMessage(err, fallbackMessage) } : {}),
  };
}

/** Mapper for forms whose field keys equal the backend detail paths. */
export function identityFieldMapper<K extends string>(
  fields: readonly K[],
): (path: string) => K | undefined {
  const known = new Set<string>(fields);
  return (path) => (known.has(path) ? (path as K) : undefined);
}
