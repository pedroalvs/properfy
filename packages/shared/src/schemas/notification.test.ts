import { describe, it, expect } from 'vitest';
import {
  listNotificationsQuerySchema,
  upsertNotificationTemplateSchema,
  listNotificationTemplatesQuerySchema,
  testSendEmailRequestSchema,
  testSendSmsRequestSchema,
  testSendRequestSchema,
  testSendResponseSchema,
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
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid input with only required fields', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyHtml: '<p>Your inspection is scheduled</p>',
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBeUndefined();
      expect(result.data.bodyHtml).toBe('<p>Your inspection is scheduled</p>');
    }
  });

  it('should reject missing bodyHtml', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing isActive', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyHtml: '<p>Some text</p>',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty bodyHtml', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyHtml: '',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty subject', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: '',
      bodyHtml: '<p>Some text</p>',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject subject exceeding 255 characters', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: 'a'.repeat(256),
      bodyHtml: '<p>Some text</p>',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('should accept subject at exactly 255 characters', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      subject: 'a'.repeat(255),
      bodyHtml: '<p>Some text</p>',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-boolean isActive', () => {
    const result = upsertNotificationTemplateSchema.safeParse({
      bodyHtml: '<p>Some text</p>',
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

  it('should honour includeDefaults=false as a query STRING', () => {
    // Real query strings deliver "false", not false. Under z.coerce.boolean()
    // that parsed as true and platform defaults could never be excluded.
    const result = listNotificationTemplatesQuerySchema.safeParse({ includeDefaults: 'false' });
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

const validAuPhone = '+61412345678';

describe('testSendEmailRequestSchema', () => {
  it('should accept a bare recipient email (no scope, no draft)', () => {
    const result = testSendEmailRequestSchema.safeParse({ recipientEmail: 'ops@properfy.com' });
    expect(result.success).toBe(true);
  });

  it('should accept an optional tenant scope and draft fields', () => {
    const result = testSendEmailRequestSchema.safeParse({
      recipientEmail: 'ops@properfy.com',
      tenantId: validUuid,
      draftSubject: 'Preview subject',
      draftBodyHtml: '<p>Hello</p>',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a malformed recipient email', () => {
    const result = testSendEmailRequestSchema.safeParse({ recipientEmail: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('should reject a non-UUID tenantId', () => {
    const result = testSendEmailRequestSchema.safeParse({
      recipientEmail: 'ops@properfy.com',
      tenantId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty draft subject or body', () => {
    expect(
      testSendEmailRequestSchema.safeParse({ recipientEmail: 'ops@properfy.com', draftSubject: '' }).success,
    ).toBe(false);
    expect(
      testSendEmailRequestSchema.safeParse({ recipientEmail: 'ops@properfy.com', draftBodyHtml: '' }).success,
    ).toBe(false);
  });
});

describe('testSendSmsRequestSchema', () => {
  it('should accept a valid AU E.164 recipient phone', () => {
    const result = testSendSmsRequestSchema.safeParse({ recipientPhone: validAuPhone });
    expect(result.success).toBe(true);
  });

  it('should accept an optional tenant scope and draft body', () => {
    const result = testSendSmsRequestSchema.safeParse({
      recipientPhone: validAuPhone,
      tenantId: validUuid,
      draftBodyText: 'Properfy: reminder',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a non-E.164 or non-AU phone', () => {
    expect(testSendSmsRequestSchema.safeParse({ recipientPhone: '0412345678' }).success).toBe(false);
    expect(testSendSmsRequestSchema.safeParse({ recipientPhone: '+14155552671' }).success).toBe(false);
  });

  it('should reject an empty draft body', () => {
    const result = testSendSmsRequestSchema.safeParse({ recipientPhone: validAuPhone, draftBodyText: '' });
    expect(result.success).toBe(false);
  });
});

describe('testSendRequestSchema (route-level union)', () => {
  it('should accept an email-only body', () => {
    expect(testSendRequestSchema.safeParse({ recipientEmail: 'ops@properfy.com' }).success).toBe(true);
  });

  it('should accept an SMS-only body', () => {
    expect(testSendRequestSchema.safeParse({ recipientPhone: validAuPhone }).success).toBe(true);
  });

  it('should accept an empty object (all fields optional at the route layer)', () => {
    expect(testSendRequestSchema.safeParse({}).success).toBe(true);
  });

  it('should reject a malformed email or phone when present', () => {
    expect(testSendRequestSchema.safeParse({ recipientEmail: 'nope' }).success).toBe(false);
    expect(testSendRequestSchema.safeParse({ recipientPhone: '12345' }).success).toBe(false);
  });
});

describe('testSendResponseSchema', () => {
  it('should accept a well-formed response with an ISO datetime sentAt', () => {
    const result = testSendResponseSchema.safeParse({
      messageId: 'msg-123',
      recipient: 'ops@properfy.com',
      sentAt: '2026-08-25T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a non-datetime sentAt', () => {
    const result = testSendResponseSchema.safeParse({
      messageId: 'msg-123',
      recipient: 'ops@properfy.com',
      sentAt: '2026-08-25',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a response missing messageId', () => {
    const result = testSendResponseSchema.safeParse({
      recipient: 'ops@properfy.com',
      sentAt: '2026-08-25T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
