import type { BranchEntity } from './branch.entity';

export interface BranchFilters {
  status?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IBranchRepository {
  findById(id: string, tenantId: string): Promise<BranchEntity | null>;
  findByName(tenantId: string, name: string): Promise<BranchEntity | null>;
  findAll(
    tenantId: string,
    filters: BranchFilters,
    pagination: PaginationParams,
  ): Promise<BranchEntity[]>;
  count(tenantId: string, filters: BranchFilters): Promise<number>;
  countByTenantIds(tenantIds: string[]): Promise<Record<string, number>>;
  save(branch: BranchEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      name: string;
      addressJson: Record<string, unknown> | null;
      contactEmail: string | null;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
}
