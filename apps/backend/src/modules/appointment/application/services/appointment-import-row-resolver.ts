import { todayInTzDateString } from '@properfy/shared';
import type { ResolvedImportRow, ImportRowIssue, ImportSummary, ImportRowSeverity } from '@properfy/shared';
import { normalizeImportRow, type RawImportRow, type NormalizedRow } from '../../domain/appointment-import-normalize';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { PropertyEntity } from '../../../property/domain/property.entity';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { ServiceTypeEntity } from '../../../service-type/domain/service-type.entity';
import type { IPricingRuleRepository } from '../../../pricing-rule/domain/pricing-rule.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import type { ContactEntity } from '../../../contact/domain/contact.entity';
import { isIdenticalContact } from '../../../contact/domain/contact-identity';
import { resolvePricingRule } from '../../../pricing-rule/domain/resolve-pricing-rule';

export interface ResolveContext {
  tenantId: string;
  branchId: string;
  /** IANA timezone used to compute "today" for defaulting and the past-date check. */
  tz: string;
}

function errorIssue(field: string, code: string, message: string): ImportRowIssue {
  return { field, code, severity: 'error', message };
}
function warningIssue(field: string, code: string, message: string): ImportRowIssue {
  return { field, code, severity: 'warning', message };
}

/**
 * Read-only row resolver — the single source of truth consumed by BOTH the
 * synchronous preview endpoint and the commit worker (which re-resolves the
 * stored file for a fresh, retry-safe view of the world). Never writes
 * anything; every DB call here is a lookup.
 *
 * Per-row required-field ERRORS (missing service type / pricing / address /
 * contact, past dates) are decided here, since they need DB context the pure
 * normalizer (`appointment-import-normalize.ts`) doesn't have.
 */
export class AppointmentImportRowResolver {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly contactRepo: IContactRepository,
  ) {}

  async resolve(
    rawRows: RawImportRow[],
    ctx: ResolveContext,
  ): Promise<{ rows: ResolvedImportRow[]; summary: ImportSummary }> {
    const today = todayInTzDateString(ctx.tz);

    // Normalize every row up front (pure, no DB) so the address/email/phone
    // lookups below can be batched into ONE query each instead of one
    // round-trip per row — essential for the synchronous preview to stay
    // viable up to MAX_PREVIEW_ROWS.
    const normalizedRows = rawRows.map((raw) => normalizeImportRow(raw, today));

    const addressKeys = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (const { normalized } of normalizedRows) {
      const { street, addressLine2, suburb, state, postcode } = normalized;
      if (street && suburb && state && postcode) {
        addressKeys.add(buildNormalizedAddressKey({ street, addressLine2, suburb, state, postcode }));
      }
      const { email, phone } = normalized.primaryContact;
      if (email) emails.add(email);
      if (phone) phones.add(phone);
    }

    const existingProperties = addressKeys.size > 0
      ? await this.propertyRepo.findManyByNormalizedAddressKeys(ctx.tenantId, [...addressKeys])
      : [];
    const propertyByKey = new Map<string, PropertyEntity>(
      existingProperties.map((p) => [p.normalizedAddressKey, p]),
    );

    const existingContacts = (emails.size > 0 || phones.size > 0)
      ? await this.contactRepo.findManyActiveByEmailsOrPhones([...emails], [...phones])
      : [];
    const contactByEmail = new Map<string, ContactEntity>();
    const contactByPhone = new Map<string, ContactEntity>();
    for (const c of existingContacts) {
      if (c.primaryEmail) contactByEmail.set(c.primaryEmail, c);
      if (c.primaryPhone) contactByPhone.set(c.primaryPhone, c);
    }

    // A batch typically shares one service type and always shares one branch,
    // so these caches collapse what would be N per-row queries into ~1 each.
    const serviceTypeCache = new Map<string, ServiceTypeEntity | null>();
    const pricingExistsCache = new Map<string, boolean>();
    // Intra-batch dedupe for NEW properties: same normalized address within
    // this import -> every row after the first is marked duplicateOfRow, so
    // the commit worker creates exactly one property for the group.
    const newPropertyFirstRow = new Map<string, number>();

    const rows: ResolvedImportRow[] = [];
    for (let i = 0; i < normalizedRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed + header row
      rows.push(
        await this.resolveRow(
          normalizedRows[i]!, rowNumber, ctx, today,
          serviceTypeCache, pricingExistsCache, newPropertyFirstRow,
          propertyByKey, contactByEmail, contactByPhone,
        ),
      );
    }

    const summary: ImportSummary = {
      totalRows: rows.length,
      importable: rows.filter((r) => r.importable).length,
      withWarnings: rows.filter((r) => r.severity === 'warning').length,
      withErrors: rows.filter((r) => r.severity === 'error').length,
    };

    return { rows, summary };
  }

  private async resolveRow(
    { normalized, issues: normalizeIssues }: { normalized: NormalizedRow; issues: ImportRowIssue[] },
    rowNumber: number,
    ctx: ResolveContext,
    today: string,
    serviceTypeCache: Map<string, ServiceTypeEntity | null>,
    pricingExistsCache: Map<string, boolean>,
    newPropertyFirstRow: Map<string, number>,
    propertyByKey: Map<string, PropertyEntity>,
    contactByEmail: Map<string, ContactEntity>,
    contactByPhone: Map<string, ContactEntity>,
  ): Promise<ResolvedImportRow> {
    const issues: ImportRowIssue[] = [...normalizeIssues];

    const serviceTypeId = await this.resolveServiceType(normalized.serviceTypeName, ctx, serviceTypeCache, pricingExistsCache, issues);
    const property = this.resolveProperty(normalized, newPropertyFirstRow, rowNumber, issues, propertyByKey);
    const contact = this.resolveContact(normalized, issues, contactByEmail, contactByPhone);

    if (normalized.scheduledDate < today) {
      issues.push(errorIssue('scheduledDate', 'PAST_DATE', `Date ${normalized.scheduledDate} is in the past`));
    }

    const hasError = issues.some((i) => i.severity === 'error');
    const severity: ImportRowSeverity = hasError ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'ready';

    return {
      rowNumber,
      severity,
      importable: !hasError,
      serviceTypeName: normalized.serviceTypeName,
      serviceTypeId,
      scheduledDate: normalized.scheduledDate,
      scheduledDateDefaulted: normalized.scheduledDateDefaulted,
      timeSlotStart: normalized.timeSlotStart,
      timeSlotEnd: normalized.timeSlotEnd,
      timeDefaulted: normalized.timeDefaulted,
      notes: normalized.notes,
      property,
      contact,
      customFields: normalized.customFields,
      customFieldsTruncated: normalized.customFieldsTruncated,
      issues,
    };
  }

  private async resolveServiceType(
    serviceTypeName: string | null,
    ctx: ResolveContext,
    serviceTypeCache: Map<string, ServiceTypeEntity | null>,
    pricingExistsCache: Map<string, boolean>,
    issues: ImportRowIssue[],
  ): Promise<string | null> {
    if (!serviceTypeName) {
      issues.push(errorIssue('serviceType', 'SERVICE_TYPE_REQUIRED', 'Service type (Type column) is required'));
      return null;
    }

    const cacheKey = serviceTypeName.toLowerCase();
    let serviceType = serviceTypeCache.get(cacheKey);
    if (serviceType === undefined) {
      serviceType = await this.serviceTypeRepo.findByName(serviceTypeName);
      serviceTypeCache.set(cacheKey, serviceType);
    }

    if (!serviceType) {
      issues.push(errorIssue('serviceType', 'SERVICE_TYPE_NOT_FOUND', `No service type named '${serviceTypeName}'`));
      return null;
    }
    if (!serviceType.isActive()) {
      issues.push(errorIssue('serviceType', 'SERVICE_TYPE_INACTIVE', `Service type '${serviceTypeName}' is inactive`));
      return null;
    }

    let pricingExists = pricingExistsCache.get(serviceType.id);
    if (pricingExists === undefined) {
      const rules = await this.pricingRuleRepo.findAll(
        { tenantId: ctx.tenantId, serviceTypeId: serviceType.id, status: 'ACTIVE' },
        { page: 1, pageSize: 100, sortOrder: 'asc' },
      );
      pricingExists = resolvePricingRule(rules, ctx.branchId) != null;
      pricingExistsCache.set(serviceType.id, pricingExists);
    }
    if (!pricingExists) {
      issues.push(errorIssue('serviceType', 'NO_PRICE_RULE', `No pricing rule for '${serviceTypeName}' at the selected agency/branch`));
      return null;
    }

    return serviceType.id;
  }

  private resolveProperty(
    normalized: NormalizedRow,
    newPropertyFirstRow: Map<string, number>,
    rowNumber: number,
    issues: ImportRowIssue[],
    propertyByKey: Map<string, PropertyEntity>,
  ): ResolvedImportRow['property'] {
    const { street, addressLine2, apartmentNumber, suburb, state, postcode, country } = normalized;
    if (!street) issues.push(errorIssue('property', 'PROPERTY_STREET_REQUIRED', 'Street is required'));
    if (!suburb) issues.push(errorIssue('property', 'PROPERTY_SUBURB_REQUIRED', 'Suburb is required'));
    if (!state) issues.push(errorIssue('property', 'PROPERTY_STATE_REQUIRED', 'State is required'));
    if (!postcode) issues.push(errorIssue('property', 'PROPERTY_POSTCODE_REQUIRED', 'Postcode is required'));
    if (!street || !suburb || !state || !postcode) return null;

    const addr = { street, addressLine2, suburb, state, postcode };
    const key = buildNormalizedAddressKey(addr);
    const existing = propertyByKey.get(key);
    if (existing) {
      return {
        resolution: 'existing',
        propertyId: existing.id,
        propertyCode: existing.propertyCode,
        street, addressLine2, apartmentNumber, suburb, state, postcode, country,
        duplicateOfRow: null,
        geocode: null,
      };
    }

    const firstRow = newPropertyFirstRow.get(key);
    if (firstRow === undefined) newPropertyFirstRow.set(key, rowNumber);

    if (apartmentNumber) {
      issues.push(warningIssue('property', 'PROPERTY_TYPE_INFERRED_APARTMENT',
        'Apartment value provided — property will be created as type Apartment'));
    }

    return {
      resolution: 'new',
      propertyId: null,
      propertyCode: null,
      street, addressLine2, apartmentNumber, suburb, state, postcode, country,
      duplicateOfRow: firstRow ?? null,
      geocode: null,
    };
  }

  private resolveContact(
    normalized: NormalizedRow,
    issues: ImportRowIssue[],
    contactByEmail: Map<string, ContactEntity>,
    contactByPhone: Map<string, ContactEntity>,
  ): ResolvedImportRow['contact'] {
    const { name, email, phone } = normalized.primaryContact;
    if (!name || !email || !phone) {
      // Not required to import — the row still creates an appointment,
      // just without a contact attached (the engine supports this; see
      // CreateAppointmentUseCase's `contacts` array, which defaults to
      // empty). Surfaced as a warning so the operator can still fix the
      // sheet and re-import if they want the contact.
      issues.push(warningIssue('contact', 'CONTACT_INCOMPLETE', 'Primary contact is incomplete (missing name, email, or phone) — will import without a contact'));
      // With no contact at all being created, any secondary/tertiary/
      // quaternary email or phone on the sheet has nothing to attach to —
      // call that out explicitly rather than silently dropping it.
      if (normalized.additionalChannelCandidates.length > 0) {
        issues.push(warningIssue('contact', 'CONTACT_CHANNELS_NOT_APPLIED',
          'Primary contact is incomplete, so the extra channels from the sheet were not applied either'));
      }
      return null;
    }

    // A registry contact is only linked when the row is fully identical to it
    // (name + email + phone — see isIdenticalContact). A partial channel
    // collision means "same email/phone, different person data": the global
    // unique indexes forbid creating a duplicate row for that channel, so the
    // appointment keeps the sheet data as its snapshot with no registry link.
    const candidates = [contactByEmail.get(email), contactByPhone.get(phone)]
      .filter((c): c is ContactEntity => c !== undefined);
    const identical = candidates.find((c) => isIdenticalContact(c, { name, email, phone }));
    const hasExtraChannels = normalized.additionalChannelCandidates.length > 0;
    if (identical) {
      if (hasExtraChannels) {
        issues.push(warningIssue('contact', 'CONTACT_CHANNELS_NOT_APPLIED',
          'Existing contact linked; extra channels from the sheet were not applied'));
      }
      return {
        resolution: 'existing',
        contactId: identical.id,
        displayName: identical.displayName,
        primaryEmail: identical.primaryEmail,
        primaryPhone: identical.primaryPhone,
        additionalChannels: [],
        channelsDropped: hasExtraChannels,
      };
    }
    if (candidates.length > 0) {
      issues.push(warningIssue('contact', 'CONTACT_MISMATCH_SNAPSHOT_ONLY',
        'Row contact shares an email/phone with a registry contact but the data differs — the appointment will show the spreadsheet data without linking the registry contact'));
      if (hasExtraChannels) {
        issues.push(warningIssue('contact', 'CONTACT_CHANNELS_NOT_APPLIED',
          'Contact is not linked to the registry, so the extra channels from the sheet were not applied'));
      }
      return {
        resolution: 'snapshot-only',
        contactId: null,
        displayName: name,
        primaryEmail: email,
        primaryPhone: phone,
        additionalChannels: [],
        channelsDropped: hasExtraChannels,
      };
    }

    return {
      resolution: 'new',
      contactId: null,
      displayName: name,
      primaryEmail: email,
      primaryPhone: phone,
      additionalChannels: normalized.additionalChannelCandidates.map((c) => ({
        channel: c.channel, value: c.value, label: c.label,
      })),
      channelsDropped: false,
    };
  }
}
