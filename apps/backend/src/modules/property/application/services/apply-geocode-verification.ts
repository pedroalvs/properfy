import type {
  GeocodeVerification,
  ImportPropertyPlan,
  ImportRowIssue,
  ImportRowSeverity,
  ImportSummary,
} from '@properfy/shared';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';

/** Structural row shape shared by the property and appointment import
 * resolvers — just what the geocode post-pass needs to read and mutate. */
export interface GeocodeVerifiableRow {
  severity: ImportRowSeverity;
  importable: boolean;
  property: ImportPropertyPlan | null;
  issues: ImportRowIssue[];
}

/** The subset of ImportGeocodeVerifier this post-pass depends on. */
export interface IImportGeocodeVerifier {
  verifyMany(addresses: Map<string, string>): Promise<Map<string, GeocodeVerification>>;
}

function fullAddress(plan: ImportPropertyPlan): string {
  const parts = [plan.street];
  if (plan.addressLine2) parts.push(plan.addressLine2);
  parts.push(plan.suburb, plan.state, plan.postcode, plan.country);
  return parts.join(', ');
}

function planKey(plan: ImportPropertyPlan): string {
  return buildNormalizedAddressKey({
    street: plan.street,
    addressLine2: plan.addressLine2,
    suburb: plan.suburb,
    state: plan.state,
    postcode: plan.postcode,
  });
}

/**
 * Preview post-pass: geocode-verify every unique address that would create a
 * NEW property, and write the outcome onto each row's property plan (rows
 * marked `duplicateOfRow` inherit the first occurrence's verification via the
 * shared normalized key). Kept OUT of the row resolvers on purpose — the
 * commit workers re-run the resolver fresh, and must never re-geocode; they
 * read the verification back from `previewJson` instead.
 *
 * `not_found` / `unverified` become non-blocking warnings: the row stays
 * importable, mirroring single-property creation (a no-match address creates
 * the property as geocoding FAILED).
 */
export async function applyGeocodeVerification(
  rows: GeocodeVerifiableRow[],
  verifier: IImportGeocodeVerifier,
): Promise<void> {
  const addresses = new Map<string, string>();
  for (const row of rows) {
    const plan = row.property;
    if (!plan || plan.resolution !== 'new' || plan.duplicateOfRow !== null) continue;
    const key = planKey(plan);
    if (!addresses.has(key)) addresses.set(key, fullAddress(plan));
  }
  if (addresses.size === 0) return;

  const verifications = await verifier.verifyMany(addresses);

  for (const row of rows) {
    const plan = row.property;
    if (!plan || plan.resolution !== 'new') continue;
    const verification = verifications.get(planKey(plan)) ?? null;
    plan.geocode = verification;
    if (!verification) continue;

    if (verification.status === 'not_found') {
      row.issues.push({
        field: 'property',
        code: 'ADDRESS_NOT_FOUND',
        severity: 'warning',
        message: 'Address was not found by geocoding — the property will be created but flagged for manual location',
      });
    } else if (verification.status === 'unverified') {
      row.issues.push({
        field: 'property',
        code: 'ADDRESS_NOT_VERIFIED',
        severity: 'warning',
        message: 'Address could not be verified in time — geocoding will finish in the background',
      });
    }
    if (row.severity === 'ready' && row.issues.some((i) => i.severity === 'warning')) {
      row.severity = 'warning';
    }
  }
}

/** Recompute the preview summary after a post-pass mutated row severities. */
export function computeImportSummary(rows: Array<Pick<GeocodeVerifiableRow, 'severity' | 'importable'>>): ImportSummary {
  return {
    totalRows: rows.length,
    importable: rows.filter((r) => r.importable).length,
    withWarnings: rows.filter((r) => r.severity === 'warning').length,
    withErrors: rows.filter((r) => r.severity === 'error').length,
  };
}
