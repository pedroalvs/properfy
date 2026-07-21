import { describe, it, expect, vi } from 'vitest';
import type { GeocodeVerification, ImportPropertyPlan } from '@properfy/shared';
import { applyGeocodeVerification, computeImportSummary, type GeocodeVerifiableRow } from './apply-geocode-verification';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';

function plan(overrides: Partial<ImportPropertyPlan> = {}): ImportPropertyPlan {
  return {
    resolution: 'new',
    propertyId: null,
    propertyCode: null,
    street: '1 Test St',
    addressLine2: null,
    apartmentNumber: null,
    suburb: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    country: 'Australia',
    duplicateOfRow: null,
    geocode: null,
    ...overrides,
  };
}

function row(overrides: Partial<GeocodeVerifiableRow> = {}): GeocodeVerifiableRow {
  return { severity: 'ready', importable: true, property: plan(), issues: [], ...overrides };
}

function verifierReturning(byKey: Record<string, GeocodeVerification>) {
  return {
    verifyMany: vi.fn(async (addresses: Map<string, string>) => {
      const out = new Map<string, GeocodeVerification>();
      for (const key of addresses.keys()) {
        out.set(key, byKey[key] ?? { status: 'unverified', lat: null, lng: null });
      }
      return out;
    }),
  };
}

const KEY = buildNormalizedAddressKey({
  street: '1 Test St', addressLine2: null, suburb: 'Sydney', state: 'NSW', postcode: '2000',
});

describe('applyGeocodeVerification', () => {
  it('does not call the verifier when there are no new-property rows', async () => {
    const verifier = verifierReturning({});
    const rows = [
      row({ property: plan({ resolution: 'existing', propertyId: 'p-1', propertyCode: 'X-1' }) }),
      row({ property: null, severity: 'error', importable: false }),
    ];
    await applyGeocodeVerification(rows, verifier);
    expect(verifier.verifyMany).not.toHaveBeenCalled();
    expect(rows[0]!.property!.geocode).toBeNull();
  });

  it('sends each unique new address once, skipping duplicates and existing matches', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'found', lat: -33.8, lng: 151.2 } });
    const rows = [
      row(),
      row({ property: plan({ duplicateOfRow: 2 }) }),
      row({ property: plan({ resolution: 'existing', propertyId: 'p-1', propertyCode: 'X-1' }) }),
    ];
    await applyGeocodeVerification(rows, verifier);
    expect(verifier.verifyMany).toHaveBeenCalledTimes(1);
    const sent = verifier.verifyMany.mock.calls[0]![0] as Map<string, string>;
    expect([...sent.keys()]).toEqual([KEY]);
    expect(sent.get(KEY)).toBe('1 Test St, Sydney, NSW, 2000, Australia');
  });

  it('writes found verification onto every new row sharing the address, without issues', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'found', lat: -33.8, lng: 151.2 } });
    const rows = [row(), row({ property: plan({ duplicateOfRow: 2 }) })];
    await applyGeocodeVerification(rows, verifier);
    for (const r of rows) {
      expect(r.property!.geocode).toEqual({ status: 'found', lat: -33.8, lng: 151.2 });
      expect(r.issues).toEqual([]);
      expect(r.severity).toBe('ready');
    }
  });

  it('appends an ADDRESS_NOT_FOUND warning and escalates ready rows to warning', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'not_found', lat: null, lng: null } });
    const rows = [row()];
    await applyGeocodeVerification(rows, verifier);
    expect(rows[0]!.property!.geocode).toEqual({ status: 'not_found', lat: null, lng: null });
    expect(rows[0]!.issues).toEqual([
      expect.objectContaining({ code: 'ADDRESS_NOT_FOUND', severity: 'warning', field: 'property' }),
    ]);
    expect(rows[0]!.severity).toBe('warning');
    expect(rows[0]!.importable).toBe(true);
  });

  it('appends an ADDRESS_NOT_VERIFIED warning for unverified addresses', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'unverified', lat: null, lng: null } });
    const rows = [row()];
    await applyGeocodeVerification(rows, verifier);
    expect(rows[0]!.issues).toEqual([
      expect.objectContaining({ code: 'ADDRESS_NOT_VERIFIED', severity: 'warning' }),
    ]);
    expect(rows[0]!.severity).toBe('warning');
  });

  it('keeps error severity and importability of already-broken rows', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'not_found', lat: null, lng: null } });
    const rows = [
      row({
        severity: 'error',
        importable: false,
        issues: [{ field: 'type', code: 'INVALID_TYPE', severity: 'error', message: 'bad type' }],
      }),
    ];
    await applyGeocodeVerification(rows, verifier);
    expect(rows[0]!.severity).toBe('error');
    expect(rows[0]!.importable).toBe(false);
    expect(rows[0]!.issues).toHaveLength(2);
  });

  it('leaves existing-property rows untouched', async () => {
    const verifier = verifierReturning({ [KEY]: { status: 'not_found', lat: null, lng: null } });
    const existing = row({ property: plan({ resolution: 'existing', propertyId: 'p-1', propertyCode: 'X-1', street: '9 Other St' }) });
    const rows = [row(), existing];
    await applyGeocodeVerification(rows, verifier);
    expect(existing.property!.geocode).toBeNull();
    expect(existing.issues).toEqual([]);
  });
});

describe('computeImportSummary', () => {
  it('counts totals, importable and severities', () => {
    const rows = [
      row(),
      row({ severity: 'warning' }),
      row({ severity: 'error', importable: false }),
    ];
    expect(computeImportSummary(rows)).toEqual({
      totalRows: 3,
      importable: 2,
      withWarnings: 1,
      withErrors: 1,
    });
  });
});
