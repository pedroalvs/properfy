import type { ContactType } from '@properfy/shared';
import type { IContactRepository } from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';

export interface ListContactsInput {
  tenantId: string;
  type?: ContactType;
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ListContactsItem {
  contact: ContactEntity;
  propertyCount: number;
}

export interface ListContactsResult {
  data: ListContactsItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lists contacts in a tenant and hydrates the `propertyCount` aggregate per
 * row in a single batched query (avoids N+1).
 */
export class ListContactsUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(input: ListContactsInput): Promise<ListContactsResult> {
    const filters = {
      tenantId: input.tenantId,
      type: input.type,
      isActive: input.isActive ?? true,
      search: input.search,
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
    const counts = ids.length > 0
      ? await this.contactRepo.countDistinctPropertiesByContactIds(ids)
      : new Map<string, number>();

    const data: ListContactsItem[] = contacts.map((contact) => ({
      contact,
      propertyCount: counts.get(contact.id) ?? 0,
    }));

    return { data, total, page: input.page, pageSize: input.pageSize };
  }
}
