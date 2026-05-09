import type { ContactType } from '@properfy/shared';
import type { IContactRepository } from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';

export interface ListContactsInput {
  tenantId: string;
  /** 023 §FR-204: multiselect; single value still accepted (wrapped). */
  type?: ContactType | ContactType[];
  isActive?: boolean;
  search?: string;
  /** 023 §FR-204: branch multiselect. */
  branchIds?: string[];
  /** 023 §FR-205: only contacts with `primaryInPropertyCount > 0`. */
  primary?: boolean;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ListContactsItem {
  contact: ContactEntity;
  propertyCount: number;
  /** 023 §FR-202 — distinct properties on which this contact is primary. */
  primaryInPropertyCount: number;
}

export interface ListContactsResult {
  data: ListContactsItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lists contacts in a tenant and hydrates the `propertyCount` and
 * `primaryInPropertyCount` aggregates per row in two batched queries
 * (avoids N+1; one row scan + one aggregation per metric).
 */
export class ListContactsUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(input: ListContactsInput): Promise<ListContactsResult> {
    const types = input.type === undefined
      ? undefined
      : Array.isArray(input.type)
        ? input.type
        : [input.type];

    const filters = {
      tenantId: input.tenantId,
      type: types,
      isActive: input.isActive ?? true,
      search: input.search,
      branchIds: input.branchIds,
      primary: input.primary,
    };
    const pagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    const [contacts, total] = await Promise.all([
      this.contactRepo.findAll(filters, pagination),
      this.contactRepo.count(filters),
    ]);

    const ids = contacts.map((c) => c.id);
    const [propertyCounts, primaryCounts] = ids.length > 0
      ? await Promise.all([
          this.contactRepo.countDistinctPropertiesByContactIds(ids),
          this.contactRepo.countPrimaryDistinctPropertiesByContactIds(ids),
        ])
      : [new Map<string, number>(), new Map<string, number>()];

    const data: ListContactsItem[] = contacts.map((contact) => ({
      contact,
      propertyCount: propertyCounts.get(contact.id) ?? 0,
      primaryInPropertyCount: primaryCounts.get(contact.id) ?? 0,
    }));

    return { data, total, page: input.page, pageSize: input.pageSize };
  }
}
