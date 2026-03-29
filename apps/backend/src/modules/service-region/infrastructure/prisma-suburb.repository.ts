import type { PrismaClient } from '@prisma/client';
import { SuburbEntity } from '../domain/suburb.entity';
import type {
  ISuburbRepository,
  SuburbFilters,
  PaginationParams,
} from '../domain/suburb.repository';
import type { SuburbStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: string;
  created_at: Date;
}): SuburbEntity {
  return new SuburbEntity({
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    country: row.country,
    postcode: row.postcode,
    status: row.status as SuburbStatus,
    createdAt: row.created_at,
  });
}

export class PrismaSuburbRepository implements ISuburbRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<SuburbEntity | null> {
    const row = await this.prisma.suburb.findFirst({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findOrCreate(data: {
    name: string;
    city: string;
    state: string;
    country: string;
    postcode?: string;
  }): Promise<SuburbEntity> {
    const row = await this.prisma.suburb.upsert({
      where: {
        name_city_state_country: {
          name: data.name,
          city: data.city,
          state: data.state,
          country: data.country,
        },
      },
      update: {},
      create: {
        name: data.name,
        city: data.city,
        state: data.state,
        country: data.country,
        postcode: data.postcode ?? null,
      },
    });
    return mapToEntity(row);
  }

  async findAll(
    filters: SuburbFilters,
    pagination: PaginationParams,
  ): Promise<SuburbEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.suburb.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: SuburbFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.suburb.count({ where });
  }

  async findOrphans(pagination: PaginationParams): Promise<SuburbEntity[]> {
    const rows = await this.prisma.suburb.findMany({
      where: { region_suburbs: { none: {} } },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async countOrphans(): Promise<number> {
    return this.prisma.suburb.count({
      where: { region_suburbs: { none: {} } },
    });
  }

  async distinctStates(country: string): Promise<string[]> {
    const rows = await this.prisma.suburb.findMany({
      where: { country, status: 'ACTIVE' },
      distinct: ['state'],
      select: { state: true },
      orderBy: { state: 'asc' },
    });
    return rows.map((r) => r.state);
  }

  async distinctCities(country: string, state: string): Promise<string[]> {
    const rows = await this.prisma.suburb.findMany({
      where: { country, state, status: 'ACTIVE' },
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' },
    });
    return rows.map((r) => r.city);
  }

  private buildWhere(filters: SuburbFilters) {
    const where: Record<string, unknown> = {};
    if (filters.country) where['country'] = filters.country;
    if (filters.state) where['state'] = filters.state;
    if (filters.city) where['city'] = filters.city;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { postcode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
