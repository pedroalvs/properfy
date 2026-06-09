import type {
  IAppCredentialRepository,
  AppCredentialListRow,
} from '../../domain/app-credential.repository';

export interface ListAppCredentialsInput {
  tenantId?: string | null;
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ListAppCredentialsOutput {
  data: AppCredentialListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListAppCredentialsUseCase {
  constructor(private readonly repo: IAppCredentialRepository) {}

  async execute(input: ListAppCredentialsInput): Promise<ListAppCredentialsOutput> {
    const filters = {
      tenantId: input.tenantId ?? undefined,
      isActive: input.isActive,
      search: input.search,
    };
    const pagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    const [data, total] = await Promise.all([
      this.repo.findAll(filters, pagination),
      this.repo.count(filters),
    ]);

    return { data, total, page: input.page, pageSize: input.pageSize };
  }
}
