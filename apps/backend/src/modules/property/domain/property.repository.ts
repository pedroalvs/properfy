import type { PropertyEntity } from './property.entity';

export interface PropertyWithBranch {
  property: PropertyEntity;
  branchName: string | null;
}

export interface PropertyFilters {
  tenantId?: string;
  branchId?: string;
  type?: string;
  search?: string;
  hasCoordinates?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IPropertyRepository {
  findById(id: string, tenantId?: string): Promise<PropertyEntity | null>;
  findByIdWithBranch(id: string, tenantId?: string): Promise<PropertyWithBranch | null>;
  findByPropertyCode(
    propertyCode: string,
    tenantId: string,
  ): Promise<PropertyEntity | null>;
  findAll(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]>;
  findAllWithBranch(filters: PropertyFilters, pagination: PaginationParams): Promise<PropertyWithBranch[]>;
  count(filters: PropertyFilters): Promise<number>;
  save(property: PropertyEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      branchId: string | null;
      propertyCode: string;
      type: string;
      street: string;
      addressLine2: string | null;
      suburb: string;
      postcode: string;
      state: string;
      country: string;
      lat: number | null;
      lng: number | null;
      geocodingStatus: string;
      notes: string | null;
      rulesJson: Record<string, unknown>;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
}
