import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppointmentImportRowResolver } from './appointment-import-row-resolver';
import type { RawImportRow } from '../../domain/appointment-import-normalize';
import { ServiceTypeEntity } from '../../../service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../pricing-rule/domain/pricing-rule.entity';
import { PropertyEntity } from '../../../property/domain/property.entity';
import { ContactEntity } from '../../../contact/domain/contact.entity';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';

function baseRawRow(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    serviceTypeName: 'Routine Inspection',
    scheduledDate: '2027-06-20',
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    street: '3/18 Ocean St',
    addressLine2: null,
    suburb: 'Kogarah',
    state: 'NSW',
    postcode: '2217',
    country: 'Australia',
    notes: null,
    realtyDescription: null,
    primaryContactName: 'Jeanette Rojas',
    primaryContactEmail: 'jeanette.rojas31@gmail.com',
    primaryContactPhone: '0412345678',
    secondaryEmail: null,
    secondaryPhone: null,
    tertiaryEmail: null,
    tertiaryPhone: null,
    quaternaryEmail: null,
    quaternaryPhone: null,
    customFieldCandidates: [],
    ...overrides,
  };
}

function buildServiceType(overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {}) {
  const now = new Date();
  return new ServiceTypeEntity({
    id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE',
    requiresRentalTenantConfirmation: true, status: 'ACTIVE', createdAt: now, updatedAt: now,
    ...overrides,
  });
}

function buildPricingRule(overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {}) {
  const now = new Date();
  return new PricingRuleEntity({
    id: 'pr-1', tenantId: TENANT_ID, currency: 'AUD', serviceTypeId: 'st-1', branchId: null,
    priceAmount: 100, payoutType: 'FIXED', payoutValue: 80, bonusRuleJson: null,
    status: 'ACTIVE', createdAt: now, updatedAt: now,
    ...overrides,
  });
}

function buildProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}) {
  const now = new Date();
  return new PropertyEntity({
    id: 'prop-1', tenantId: TENANT_ID, branchId: BRANCH_ID, propertyCode: 'PROP-001', type: 'HOUSE',
    street: '3/18 Ocean St', addressLine2: null, suburb: 'Kogarah', postcode: '2217', state: 'NSW', country: 'AU',
    lat: null, lng: null, geocodingStatus: 'PENDING', notes: null, rulesJson: {},
    createdAt: now, updatedAt: now, deletedAt: null,
    ...overrides,
  });
}

function buildContact(overrides: Partial<ConstructorParameters<typeof ContactEntity>[0]> = {}) {
  const now = new Date();
  return new ContactEntity({
    id: 'contact-1', tenantId: null, type: 'RENTAL_TENANT', displayName: 'Jeanette Rojas', company: null,
    primaryEmail: 'jeanette.rojas31@gmail.com', primaryPhone: '0412345678', additionalChannels: [],
    notes: null, isActive: true, createdAt: now, updatedAt: now,
    ...overrides,
  });
}

function buildRepos() {
  return {
    propertyRepo: { findManyByNormalizedAddressKeys: vi.fn().mockResolvedValue([]) },
    serviceTypeRepo: { findByName: vi.fn() },
    pricingRuleRepo: { findAll: vi.fn() },
    contactRepo: { findManyActiveByEmailsOrPhones: vi.fn().mockResolvedValue([]) },
  };
}

function buildResolver(repos: ReturnType<typeof buildRepos>) {
  return new AppointmentImportRowResolver(
    repos.propertyRepo as any,
    repos.serviceTypeRepo as any,
    repos.pricingRuleRepo as any,
    repos.contactRepo as any,
  );
}

const CTX = { tenantId: TENANT_ID, branchId: BRANCH_ID, tz: 'UTC' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-06-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppointmentImportRowResolver.resolve', () => {
  it('resolves a fully valid row with an existing property and existing contact', async () => {
    const repos = buildRepos();
    repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
    repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
    repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
    repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
    const resolver = buildResolver(repos);

    const { rows, summary } = await resolver.resolve([baseRawRow()], CTX);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.rowNumber).toBe(2);
    expect(row.severity).toBe('ready');
    expect(row.importable).toBe(true);
    expect(row.serviceTypeId).toBe('st-1');
    expect(row.property).toEqual(expect.objectContaining({ resolution: 'existing', propertyId: 'prop-1' }));
    expect(row.contact).toEqual(expect.objectContaining({ resolution: 'existing', contactId: 'contact-1', channelsDropped: false }));
    expect(summary).toEqual({ totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 });
  });

  it('rowNumber accounts for the header row (first data row is 2)', async () => {
    const repos = buildRepos();
    repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
    repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
    repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([]);
    repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([]);
    const resolver = buildResolver(repos);

    const { rows } = await resolver.resolve([baseRawRow(), baseRawRow()], CTX);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  describe('service type resolution', () => {
    it('errors when the Type column is empty', async () => {
      const repos = buildRepos();
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ serviceTypeName: '' })], CTX);
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'SERVICE_TYPE_REQUIRED', severity: 'error' }),
      ]));
    });

    it('errors when the named service type does not exist', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(null);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow()], CTX);
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'SERVICE_TYPE_NOT_FOUND', severity: 'error' }),
      ]));
    });

    it('errors when the named service type is inactive', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType({ status: 'INACTIVE' }));
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow()], CTX);
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'SERVICE_TYPE_INACTIVE', severity: 'error' }),
      ]));
    });

    it('caches the service-type lookup across rows sharing the same name', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([]);
      const resolver = buildResolver(repos);

      await resolver.resolve([baseRawRow(), baseRawRow()], CTX);
      expect(repos.serviceTypeRepo.findByName).toHaveBeenCalledTimes(1);
      expect(repos.pricingRuleRepo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('batched property/contact lookups', () => {
    it('issues exactly one property query and one contact query for a multi-row, multi-address batch', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([]);
      const resolver = buildResolver(repos);

      await resolver.resolve([
        baseRawRow({ street: '1 First St', primaryContactEmail: 'a@example.com' }),
        baseRawRow({ street: '2 Second St', primaryContactEmail: 'b@example.com' }),
        baseRawRow({ street: '3 Third St', primaryContactEmail: 'c@example.com' }),
      ], CTX);

      expect(repos.propertyRepo.findManyByNormalizedAddressKeys).toHaveBeenCalledTimes(1);
      expect(repos.contactRepo.findManyActiveByEmailsOrPhones).toHaveBeenCalledTimes(1);
      const [, addressKeys] = repos.propertyRepo.findManyByNormalizedAddressKeys.mock.calls[0]!;
      expect(addressKeys).toHaveLength(3);
    });

    it('resolves each row against the correct entry from the batched results', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      const propertyA = buildProperty({ id: 'prop-a', street: '1 First St' });
      const propertyB = buildProperty({ id: 'prop-b', street: '2 Second St' });
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([propertyA, propertyB]);
      const contactA = buildContact({ id: 'contact-a', primaryEmail: 'a@example.com' });
      const contactB = buildContact({ id: 'contact-b', primaryEmail: 'b@example.com' });
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([contactA, contactB]);
      const resolver = buildResolver(repos);

      const { rows } = await resolver.resolve([
        baseRawRow({ street: '1 First St', primaryContactEmail: 'a@example.com' }),
        baseRawRow({ street: '2 Second St', primaryContactEmail: 'b@example.com' }),
      ], CTX);

      expect(rows[0]!.property).toEqual(expect.objectContaining({ resolution: 'existing', propertyId: 'prop-a' }));
      expect(rows[0]!.contact).toEqual(expect.objectContaining({ resolution: 'existing', contactId: 'contact-a' }));
      expect(rows[1]!.property).toEqual(expect.objectContaining({ resolution: 'existing', propertyId: 'prop-b' }));
      expect(rows[1]!.contact).toEqual(expect.objectContaining({ resolution: 'existing', contactId: 'contact-b' }));
    });
  });

  describe('pricing resolution', () => {
    it('errors when no active pricing rule exists for the branch/tenant', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow()], CTX);
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'NO_PRICE_RULE', severity: 'error' }),
      ]));
    });
  });

  describe('property resolution', () => {
    it('errors and leaves property null when the street is missing', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ street: '' })], CTX);
      expect(rows[0]!.property).toBeNull();
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PROPERTY_STREET_REQUIRED', severity: 'error' }),
      ]));
    });

    it('plans a new property when no normalized-address match exists', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow()], CTX);
      expect(rows[0]!.property).toEqual(expect.objectContaining({ resolution: 'new', propertyId: null, duplicateOfRow: null }));
    });

    it('marks the second row of an intra-batch duplicate new address with duplicateOfRow', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);

      const { rows } = await resolver.resolve([baseRawRow(), baseRawRow()], CTX);
      expect(rows[0]!.property).toEqual(expect.objectContaining({ resolution: 'new', duplicateOfRow: null }));
      expect(rows[1]!.property).toEqual(expect.objectContaining({ resolution: 'new', duplicateOfRow: 2 }));
    });
  });

  describe('contact resolution', () => {
    it('warns and leaves contact null when the contact is incomplete, but still allows the row to import', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ primaryContactPhone: null })], CTX);
      expect(rows[0]!.contact).toBeNull();
      expect(rows[0]!.importable).toBe(true);
      expect(rows[0]!.severity).toBe('warning');
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'CONTACT_INCOMPLETE', severity: 'warning' }),
      ]));
    });

    it('warns that extra channels were not applied either when the incomplete primary contact still has secondary channels', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ primaryContactPhone: null, secondaryEmail: 'second@example.com' })], CTX);
      expect(rows[0]!.contact).toBeNull();
      expect(rows[0]!.importable).toBe(true);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'CONTACT_INCOMPLETE', severity: 'warning' }),
        expect.objectContaining({ code: 'CONTACT_CHANNELS_NOT_APPLIED', severity: 'warning' }),
      ]));
    });

    it('plans a new contact with additional channels when no match exists', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ secondaryEmail: 'second@example.com' })], CTX);
      expect(rows[0]!.contact).toEqual(expect.objectContaining({
        resolution: 'new', contactId: null,
        additionalChannels: [{ channel: 'EMAIL', value: 'second@example.com', label: 'Secondary' }],
      }));
    });

    it('drops additional channels and warns when the contact already exists', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ secondaryEmail: 'second@example.com' })], CTX);
      expect(rows[0]!.contact).toEqual(expect.objectContaining({ resolution: 'existing', additionalChannels: [], channelsDropped: true }));
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'CONTACT_CHANNELS_NOT_APPLIED', severity: 'warning' }),
      ]));
      // Warnings don't block import.
      expect(rows[0]!.importable).toBe(true);
    });
  });

  describe('past-date check', () => {
    it('errors when the sheet date is before today (system clock frozen at 2027-06-15)', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ scheduledDate: '2027-01-01' })], CTX);
      expect(rows[0]!.importable).toBe(false);
      expect(rows[0]!.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PAST_DATE', severity: 'error' }),
      ]));
    });

    it('does not flag a defaulted (empty) date as past, even though it still shows as today', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ scheduledDate: '' })], CTX);
      expect(rows[0]!.scheduledDate).toBe('2027-06-15');
      expect(rows[0]!.issues.some((i) => i.code === 'PAST_DATE')).toBe(false);
    });

    it('does not error on a future sheet date', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ scheduledDate: '2027-12-25' })], CTX);
      expect(rows[0]!.issues.some((i) => i.code === 'PAST_DATE')).toBe(false);
    });
  });

  describe('severity / summary aggregation', () => {
    it('marks a row with only warnings as warning severity but still importable', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockResolvedValue(buildServiceType());
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);
      const { rows } = await resolver.resolve([baseRawRow({ scheduledDate: '' })], CTX);
      expect(rows[0]!.severity).toBe('warning');
      expect(rows[0]!.importable).toBe(true);
    });

    it('aggregates totals/importable/warnings/errors across a mixed batch', async () => {
      const repos = buildRepos();
      repos.serviceTypeRepo.findByName.mockImplementation(async (name: string) =>
        name === 'Routine Inspection' ? buildServiceType() : null);
      repos.pricingRuleRepo.findAll.mockResolvedValue([buildPricingRule()]);
      repos.propertyRepo.findManyByNormalizedAddressKeys.mockResolvedValue([buildProperty()]);
      repos.contactRepo.findManyActiveByEmailsOrPhones.mockResolvedValue([buildContact()]);
      const resolver = buildResolver(repos);

      const { summary } = await resolver.resolve([
        baseRawRow(), // ready
        baseRawRow({ scheduledDate: '' }), // warning (defaulted date)
        baseRawRow({ serviceTypeName: 'Unknown Type' }), // error
      ], CTX);

      expect(summary).toEqual({ totalRows: 3, importable: 2, withWarnings: 1, withErrors: 1 });
    });
  });
});
