/**
 * Inspector field visibility by actor role (F01-1, decision D7 / root CLAUDE.md §7.9).
 *
 * The base address and its coordinates are visible only to AM/OP and to the
 * inspector itself; the app-adoption fields only to AM/OP. Agency roles
 * (CL_ADMIN/CL_USER) receive neither — this removes the current leak of
 * `address` to agencies. Applied to get, list and write responses.
 *
 * | field group                                   | AM/OP | INSP | CL_* |
 * |-----------------------------------------------|:-----:|:----:|:----:|
 * | address, baseLat, baseLng, baseGeocodedAt     |  keep | keep | strip|
 * | appInstalledAt, appLastSeenAt, pushEnabled,   |  keep | strip| strip|
 * |   appVersion                                  |       |      |      |
 */

export const INSPECTOR_BASE_FIELDS = [
  'address',
  'baseLat',
  'baseLng',
  'baseGeocodedAt',
] as const;

export const INSPECTOR_ADOPTION_FIELDS = [
  'appInstalledAt',
  'appLastSeenAt',
  'pushEnabled',
  'appVersion',
] as const;

/**
 * Returns a shallow copy of `dto` with the fields the actor may not see removed.
 * Never mutates the input. Unknown roles are treated like an agency role
 * (fail-closed: strip both groups).
 */
export function applyInspectorFieldVisibility<T extends object>(
  dto: T,
  role: string,
): T {
  const out = { ...dto } as Record<string, unknown>;
  const isOperational = role === 'AM' || role === 'OP';
  const isInspector = role === 'INSP';

  // Base is visible to AM/OP and the inspector; stripped for everyone else.
  if (!isOperational && !isInspector) {
    for (const key of INSPECTOR_BASE_FIELDS) delete out[key];
  }
  // Adoption is visible only to AM/OP.
  if (!isOperational) {
    for (const key of INSPECTOR_ADOPTION_FIELDS) delete out[key];
  }
  return out as T;
}
