import { describe, it, expect } from 'vitest';
import { paginationSchema } from './pagination';

describe('paginationSchema', () => {
  it('should apply defaults', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.sortOrder).toBe('desc');
  });

  it('should coerce string numbers', () => {
    const result = paginationSchema.parse({ page: '2', pageSize: '50' });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
  });

  it('should reject page < 1', () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject pageSize > 100', () => {
    const result = paginationSchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });
});
