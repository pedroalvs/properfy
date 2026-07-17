import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertyImportRowResolver } from './property-import-row-resolver';
import type { RawPropertyImportRow } from '../../domain/property-import-row';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyEntity } from '../../domain/property.entity';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function rawRow(overrides: Partial<RawPropertyImportRow> = {}): RawPropertyImportRow {
  return {
    propertyCode: 'AGY-PROP-0001',
    type: 'House',
    street: '1 Test St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'Australia',
    notes: null,
    ...overrides,
  };
}

function existingProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}): PropertyEntity {
  const now = new Date();
  return new PropertyEntity({
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tenantId: TENANT_ID,
    branchId: null,
    propertyCode: 'EXIST-001',
    type: 'HOUSE',
    street: '1 Test St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'Australia',
    lat: -33.8,
    lng: 151.2,
    geocodingStatus: 'SUCCESS',
    notes: null,
    rulesJson: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

function makeRepo(byAddress: PropertyEntity[] = [], byCode: PropertyEntity[] = []) {
  return {
    findManyByNormalizedAddressKeys: vi.fn().mockResolvedValue(byAddress),
    findManyByPropertyCodes: vi.fn().mockResolvedValue(byCode),
  } as unknown as IPropertyRepository;
}

describe('PropertyImportRowResolver', () => {
  let repo: IPropertyRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('resolves a valid row as a new property, ready and importable', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    const { rows, summary } = await resolver.resolve([rawRow()], { tenantId: TENANT_ID });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.rowNumber).toBe(2);
    expect(row.severity).toBe('ready');
    expect(row.importable).toBe(true);
    expect(row.type).toBe('HOUSE');
    expect(row.property).toMatchObject({
      resolution: 'new',
      propertyId: null,
      propertyCode: 'AGY-PROP-0001',
      street: '1 Test St',
      duplicateOfRow: null,
      geocode: null,
    });
    expect(summary).toEqual({ totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 });
  });

  it('reports required-field errors and returns null property when the address is broken', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    const { rows } = await resolver.resolve(
      [rawRow({ propertyCode: null, type: null, street: null, country: null })],
      { tenantId: TENANT_ID },
    );

    const row = rows[0]!;
    expect(row.severity).toBe('error');
    expect(row.importable).toBe(false);
    expect(row.property).toBeNull();
    const codes = row.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining([
      'PROPERTY_CODE_REQUIRED', 'PROPERTY_TYPE_REQUIRED', 'PROPERTY_STREET_REQUIRED', 'PROPERTY_COUNTRY_REQUIRED',
    ]));
  });

  it('rejects invalid property types', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    const { rows } = await resolver.resolve([rawRow({ type: 'Castle' })], { tenantId: TENANT_ID });
    expect(rows[0]!.issues).toEqual([
      expect.objectContaining({ code: 'PROPERTY_TYPE_INVALID', severity: 'error' }),
    ]);
    expect(rows[0]!.importable).toBe(false);
  });

  it('resolves an address matching an existing property as existing with a warning, skipping code checks', async () => {
    const existing = existingProperty();
    repo = makeRepo([existing], [existingProperty({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', propertyCode: 'AGY-PROP-0001', street: '99 Other St' })]);
    const resolver = new PropertyImportRowResolver(repo);
    const { rows, summary } = await resolver.resolve([rawRow()], { tenantId: TENANT_ID });

    const row = rows[0]!;
    expect(row.property).toMatchObject({
      resolution: 'existing',
      propertyId: existing.id,
      propertyCode: 'EXIST-001',
      geocode: null,
    });
    expect(row.issues).toEqual([
      expect.objectContaining({ code: 'ADDRESS_MATCHES_EXISTING', severity: 'warning' }),
    ]);
    expect(row.severity).toBe('warning');
    expect(row.importable).toBe(true);
    expect(summary.withWarnings).toBe(1);
  });

  it('errors when the property code already exists on a different address', async () => {
    repo = makeRepo([], [existingProperty({ propertyCode: 'AGY-PROP-0001', street: '99 Other St' })]);
    const resolver = new PropertyImportRowResolver(repo);
    const { rows } = await resolver.resolve([rawRow()], { tenantId: TENANT_ID });

    expect(rows[0]!.issues).toEqual([
      expect.objectContaining({ code: 'PROPERTY_CODE_CONFLICT', severity: 'error' }),
    ]);
    expect(rows[0]!.importable).toBe(false);
  });

  it('dedupes intra-batch duplicate addresses via duplicateOfRow with a warning', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    const { rows } = await resolver.resolve(
      [rawRow(), rawRow({ propertyCode: 'AGY-PROP-0002' })],
      { tenantId: TENANT_ID },
    );

    expect(rows[0]!.property!.duplicateOfRow).toBeNull();
    expect(rows[1]!.property!.duplicateOfRow).toBe(2);
    expect(rows[1]!.issues).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_ADDRESS_IN_FILE', severity: 'warning' }),
    ]);
    expect(rows[1]!.importable).toBe(true);
  });

  it('errors on intra-batch duplicate property codes across different addresses', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    const { rows } = await resolver.resolve(
      [rawRow(), rawRow({ street: '2 Other St' })],
      { tenantId: TENANT_ID },
    );

    expect(rows[0]!.importable).toBe(true);
    expect(rows[1]!.issues).toEqual([
      expect.objectContaining({ code: 'PROPERTY_CODE_DUPLICATE_IN_FILE', severity: 'error' }),
    ]);
    expect(rows[1]!.importable).toBe(false);
  });

  it('batches DB lookups into one query per kind', async () => {
    const resolver = new PropertyImportRowResolver(repo);
    await resolver.resolve(
      [rawRow(), rawRow({ propertyCode: 'AGY-PROP-0002', street: '2 Other St' })],
      { tenantId: TENANT_ID },
    );

    expect(repo.findManyByNormalizedAddressKeys).toHaveBeenCalledTimes(1);
    expect(repo.findManyByPropertyCodes).toHaveBeenCalledTimes(1);
    expect(repo.findManyByPropertyCodes).toHaveBeenCalledWith(TENANT_ID, ['AGY-PROP-0001', 'AGY-PROP-0002']);
  });
});
