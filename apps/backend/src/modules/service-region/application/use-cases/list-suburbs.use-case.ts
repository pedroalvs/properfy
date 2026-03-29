import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  ISuburbRepository,
  SuburbFilters,
  PaginationParams,
} from '../../domain/suburb.repository';

export interface ListSuburbsInput {
  filters: SuburbFilters;
  orphanOnly?: boolean;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface SuburbListItem {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: string;
  createdAt: Date;
}

export interface ListSuburbsOutput {
  data: SuburbListItem[];
  total: number;
}

export class ListSuburbsUseCase {
  constructor(
    private readonly suburbRepo: ISuburbRepository,
  ) {}

  async execute(input: ListSuburbsInput): Promise<ListSuburbsOutput> {
    const { filters, orphanOnly, pagination, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    let data;
    let total;

    if (orphanOnly) {
      [data, total] = await Promise.all([
        this.suburbRepo.findOrphans(pagination),
        this.suburbRepo.countOrphans(),
      ]);
    } else {
      [data, total] = await Promise.all([
        this.suburbRepo.findAll(filters, pagination),
        this.suburbRepo.count(filters),
      ]);
    }

    return {
      data: data.map((suburb) => ({
        id: suburb.id,
        name: suburb.name,
        city: suburb.city,
        state: suburb.state,
        country: suburb.country,
        postcode: suburb.postcode,
        status: suburb.status,
        createdAt: suburb.createdAt,
      })),
      total,
    };
  }
}
