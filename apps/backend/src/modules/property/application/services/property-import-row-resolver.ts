import type { ImportRowIssue, ImportRowSeverity, ImportSummary, ResolvedPropertyImportRow } from '@properfy/shared';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { PropertyEntity } from '../../domain/property.entity';
import type { RawPropertyImportRow } from '../../domain/property-import-row';
import { computeImportSummary } from './apply-geocode-verification';

const VALID_PROPERTY_TYPES = ['APARTMENT', 'HOUSE'];

export interface PropertyResolveContext {
  tenantId: string;
}

function errorIssue(field: string, code: string, message: string): ImportRowIssue {
  return { field, code, severity: 'error', message };
}
function warningIssue(field: string, code: string, message: string): ImportRowIssue {
  return { field, code, severity: 'warning', message };
}

/**
 * Read-only row resolver for property imports — the single source of truth
 * consumed by BOTH the synchronous preview endpoint and the commit worker
 * (which re-resolves the stored file for a fresh, retry-safe view). Mirrors
 * `AppointmentImportRowResolver`. Never writes anything.
 *
 * Reuse rule: a row whose normalized address matches an existing property
 * resolves as `existing` (a WARNING, not the legacy hard error) — commit
 * reuses that property and creates/geocodes nothing. Property-code conflicts
 * remain hard errors, but only for rows that would actually create.
 */
export class PropertyImportRowResolver {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async resolve(
    rawRows: RawPropertyImportRow[],
    ctx: PropertyResolveContext,
  ): Promise<{ rows: ResolvedPropertyImportRow[]; summary: ImportSummary }> {
    // Collect unique keys/codes up front so the two lookups below are ONE
    // indexed IN-query each, never one round-trip per row.
    const addressKeys = new Set<string>();
    const codes = new Set<string>();
    for (const raw of rawRows) {
      const { street, addressLine2, suburb, state, postcode } = raw;
      if (street && suburb && state && postcode) {
        addressKeys.add(buildNormalizedAddressKey({ street, addressLine2, suburb, state, postcode }));
      }
      if (raw.propertyCode) codes.add(raw.propertyCode);
    }

    const existingByAddress = addressKeys.size > 0
      ? await this.propertyRepo.findManyByNormalizedAddressKeys(ctx.tenantId, [...addressKeys])
      : [];
    const propertyByKey = new Map<string, PropertyEntity>(
      existingByAddress.map((p) => [p.normalizedAddressKey, p]),
    );
    const existingByCode = codes.size > 0
      ? await this.propertyRepo.findManyByPropertyCodes(ctx.tenantId, [...codes])
      : [];
    const propertyByCode = new Map<string, PropertyEntity>(
      existingByCode.map((p) => [p.propertyCode, p]),
    );

    // Intra-batch state: first row that introduced each new address, and the
    // first CREATING row that claimed each property code.
    const newPropertyFirstRow = new Map<string, number>();
    const claimedCodes = new Map<string, number>();

    const rows = rawRows.map((raw, i) =>
      this.resolveRow(raw, i + 2, propertyByKey, propertyByCode, newPropertyFirstRow, claimedCodes),
    );

    return { rows, summary: computeImportSummary(rows) };
  }

  private resolveRow(
    raw: RawPropertyImportRow,
    rowNumber: number,
    propertyByKey: Map<string, PropertyEntity>,
    propertyByCode: Map<string, PropertyEntity>,
    newPropertyFirstRow: Map<string, number>,
    claimedCodes: Map<string, number>,
  ): ResolvedPropertyImportRow {
    const issues: ImportRowIssue[] = [];
    const { propertyCode, street, addressLine2, suburb, state, postcode, country, notes } = raw;

    if (!propertyCode) issues.push(errorIssue('propertyCode', 'PROPERTY_CODE_REQUIRED', 'Property code is required'));

    let type: string | null = raw.type;
    if (!type) {
      issues.push(errorIssue('type', 'PROPERTY_TYPE_REQUIRED', 'Property type is required'));
    } else if (!VALID_PROPERTY_TYPES.includes(type.toUpperCase())) {
      issues.push(errorIssue('type', 'PROPERTY_TYPE_INVALID', `Invalid property type: ${type}`));
    } else {
      type = type.toUpperCase();
    }

    if (!street) issues.push(errorIssue('street', 'PROPERTY_STREET_REQUIRED', 'Street is required'));
    if (!suburb) issues.push(errorIssue('suburb', 'PROPERTY_SUBURB_REQUIRED', 'Suburb is required'));
    if (!state) issues.push(errorIssue('state', 'PROPERTY_STATE_REQUIRED', 'State is required'));
    if (!postcode) issues.push(errorIssue('postcode', 'PROPERTY_POSTCODE_REQUIRED', 'Postcode is required'));
    if (!country) issues.push(errorIssue('country', 'PROPERTY_COUNTRY_REQUIRED', 'Country is required'));

    let property: ResolvedPropertyImportRow['property'] = null;
    if (street && suburb && state && postcode && country) {
      const key = buildNormalizedAddressKey({ street, addressLine2, suburb, state, postcode });
      const existing = propertyByKey.get(key);
      if (existing) {
        issues.push(warningIssue(
          'property', 'ADDRESS_MATCHES_EXISTING',
          `Address matches existing property ${existing.propertyCode} — this row will reuse it and create nothing`,
        ));
        property = {
          resolution: 'existing',
          propertyId: existing.id,
          propertyCode: existing.propertyCode,
          street, addressLine2, suburb, state, postcode, country,
          duplicateOfRow: null,
          geocode: null,
        };
      } else {
        const firstRow = newPropertyFirstRow.get(key);
        if (firstRow === undefined) {
          newPropertyFirstRow.set(key, rowNumber);
          // Property-code uniqueness only matters for rows that will CREATE —
          // existing/duplicate rows create nothing, their code cell is ignored.
          if (propertyCode) {
            if (propertyByCode.has(propertyCode)) {
              issues.push(errorIssue(
                'propertyCode', 'PROPERTY_CODE_CONFLICT',
                `Property code already exists: ${propertyCode}`,
              ));
            } else {
              const claimedBy = claimedCodes.get(propertyCode);
              if (claimedBy !== undefined) {
                issues.push(errorIssue(
                  'propertyCode', 'PROPERTY_CODE_DUPLICATE_IN_FILE',
                  `Property code ${propertyCode} is already used by row ${claimedBy}`,
                ));
              } else {
                claimedCodes.set(propertyCode, rowNumber);
              }
            }
          }
        } else {
          issues.push(warningIssue(
            'property', 'DUPLICATE_ADDRESS_IN_FILE',
            `Same address as row ${firstRow} — only one property will be created`,
          ));
        }
        property = {
          resolution: 'new',
          propertyId: null,
          propertyCode: propertyCode ?? null,
          street, addressLine2, suburb, state, postcode, country,
          duplicateOfRow: firstRow ?? null,
          geocode: null,
        };
      }
    }

    const hasError = issues.some((i) => i.severity === 'error');
    const severity: ImportRowSeverity = hasError ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'ready';

    return {
      rowNumber,
      severity,
      importable: !hasError,
      propertyCode: propertyCode ?? null,
      type,
      notes: notes ?? null,
      property,
      issues,
    };
  }
}
