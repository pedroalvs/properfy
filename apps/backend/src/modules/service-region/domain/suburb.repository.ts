import type { SuburbEntity } from './suburb.entity';

export interface SuburbFilters {
  country?: string;
  state?: string;
  city?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ISuburbRepository {
  findById(id: string): Promise<SuburbEntity | null>;
  findOrCreate(data: {
    name: string;
    city: string;
    state: string;
    country: string;
    postcode?: string;
  }): Promise<SuburbEntity>;
  findAll(
    filters: SuburbFilters,
    pagination: PaginationParams,
  ): Promise<SuburbEntity[]>;
  count(filters: SuburbFilters): Promise<number>;
  findOrphans(pagination: PaginationParams): Promise<SuburbEntity[]>;
  countOrphans(): Promise<number>;
  distinctStates(country: string): Promise<string[]>;
  distinctCities(country: string, state: string): Promise<string[]>;
}
