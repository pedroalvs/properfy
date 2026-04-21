import { describe, it, expect } from 'vitest';
import {
  listNotificationsQuerySchema,
  upsertNotificationTemplateSchema,
  listNotificationTemplatesQuerySchema,
} from './notification';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('listNotificationsQuerySchema', () => {
  it('should apply pagination defaults', () => {
    const result = listNotificationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
      expect(result.data.sortBy).toBe('createdAt');
    }
  });

  it('should accept all valid filters', () => {
    const result = listNotificationsQuerySchema.safeParse({
      tenantId: validUuid,
      appointmentId: validUuid,
      channel: 'EMAIL',
      status: 'PENDING',
      templateCode: 'INITIAL_NOTICE',
      fromDate: '2026-01-01T00:00:00.000Z',
      toDate: '2026-12-31T23:59:59.000Z',
      page: 2,
      pageSize: 50,
      sortBy: 'sentAt',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID for tenantId', () => {
    const result = listNotificationsQuerySchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for appointmentId', () => {
    const result = listNotificationsQuerySchema.safeParse({ appointmentId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid channel', () => {
    const result = listNotificationsQuerySchema.safeParse({ channel: 'PUSH' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const result = listNotificationsQuerySchema.safeParse({ status: 'QUEUED' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime for fromDate', () => {
    const result = listNotificationsQuerySchema.safeParse({ fromDate: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime for toDate', () => {
    const result = listNotificationsQuerySchema.safeParse({ toDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid sortBy value', () => {
    const result = listNotificationsQuerySchema.safeParse({ sortBy: 'updatedAt' });
    expect(result.success).toBe(false);
  });

  it('should accept all valid channel values', () => {
    for (const channel of ['EMAIL', 'SMS']) {
      const result = listNotificationsQuerySchema.safeParse({ channel });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid status values', () => {
    for (const status of ['PENDING', 'SENT', 'DELIVERED', 'FAILED']) {
      const result = listNotificationsQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });
});

describe('upsertNotificationTemplateSchema', () => {
  it('should accept valid input with all fields', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: 'Inspection scheduled',
      bodyHtml: '<p>Your inspection is scheduled</p>',
      bodyText: 'Your inspection is scheduled',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid input with only required fields', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyText: 'Your inspection is scheduled',
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBeUndefined();
      expect(result.data.bodyHtml).toBeUndefined();
    }
  });

  it('should reject missing bodyText', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing isActive', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyText: 'Some text',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty bodyText', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyText: '',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty subject', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: '',
      bodyText: 'Some text',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject subject exceeding 255 characters', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: 'a'.repeat(256),
      bodyText: 'Some text',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should accept subject at exactly 255 characters', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: 'a'.repeat(255),
      bodyText: 'Some text',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty bodyHtml', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyHtml: '',
      bodyText: 'Some text',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean isActive', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyText: 'Some text',
      isActive: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('listNotificationTemplatesQuerySchema', () => {
  it('should apply defaults when empty', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDefaults).toBe(true);
    }
  });

  it('should accept all valid filters', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({
      tenantId: validUuid,
      templateCode: 'INITIAL_NOTICE',
      channel: 'SMS',
      includeDefaults: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDefaults).toBe(false);
    }
  });

  it('should reject invalid UUID for tenantId', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid channel', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({ channel: 'PUSH' });
    expect(result.success).toBe(false);
  });

  it('should coerce includeDefaults from truthy string to true', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({ includeDefaults: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDefaults).toBe(true);
    }
  });

  it('should coerce includeDefaults from number', () => {
    const result = listNotificationTemplatesQuerySchema.safeParse({ includeDefaults: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDefaults).toBe(false);
    }
  });

  it('should accept all valid channel values', () => {
    for (const channel of ['EMAIL', 'SMS']) {
      const result = listNotificationTemplatesQuerySchema.safeParse({ channel });
      expect(result.success).toBe(true);
    }
  });
});
