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

export interface ListContactsResult {
  data: ContactEntity[];
  total: number;
  page: number;
  pageSize: number;
}

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

    const [data, total] = await Promise.all([
      this.contactRepo.findAll(filters, pagination),
      this.contactRepo.count(filters),
    ]);

    return { data, total, page: input.page, pageSize: input.pageSize };
  }
}
