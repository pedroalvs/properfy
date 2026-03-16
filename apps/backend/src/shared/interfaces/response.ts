import type { PaginatedResponse } from '@properfy/shared';

export function success<T>(data: T): { data: T } {
  return { data };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  const safePage = Math.max(1, pageSize);
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / safePage),
    },
  };
}
