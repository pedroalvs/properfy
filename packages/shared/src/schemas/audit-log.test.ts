import { describe, it, expect } from 'vitest';
import { listAuditLogsQuerySchema } from './audit-log';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('listAuditLogsQuerySchema', () => {
  it('should apply pagination defaults', () => {
    const result = listAuditLogsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should accept all valid filters', () => {
    const result = listAuditLogsQuerySchema.safeParse({
      entityType: 'SERVICE_GROUP',
      entityId: validUuid,
      actorId: validUuid,
      action: 'STATUS_CHANGE',
      fromDate: '2026-01-01T00:00:00.000Z',
      toDate: '2026-12-31T23:59:59.000Z',
      page: 1,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID for entityId', () => {
    const result = listAuditLogsQuerySchema.safeParse({ entityId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for actorId', () => {
    const result = listAuditLogsQuerySchema.safeParse({ actorId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime for fromDate', () => {
    const result = listAuditLogsQuerySchema.safeParse({ fromDate: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime for toDate', () => {
    const result = listAuditLogsQuerySchema.safeParse({ toDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});
