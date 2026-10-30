import { describe, expect, it } from 'vitest';
import {
  listInspectorNoticesQuerySchema,
  publishInspectorNoticeSchema,
  pushSubscriptionSchema,
} from './inspector-notice';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('publishInspectorNoticeSchema', () => {
  it('accepts a valid ALL notice and defaults critical to false', () => {
    const r = publishInspectorNoticeSchema.safeParse({
      title: 'Road closure',
      body: 'Pacific Hwy closed',
      audience: { type: 'ALL' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.critical).toBe(false);
  });

  it('rejects a blank title', () => {
    const r = publishInspectorNoticeSchema.safeParse({
      title: '   ',
      body: 'x',
      audience: { type: 'ALL' },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['title']);
  });

  it('rejects an over-long title (121) and body (2001)', () => {
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 'a'.repeat(121),
        body: 'x',
        audience: { type: 'ALL' },
      }).success,
    ).toBe(false);
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 'ok',
        body: 'x'.repeat(2001),
        audience: { type: 'ALL' },
      }).success,
    ).toBe(false);
  });

  it('trims the body', () => {
    const r = publishInspectorNoticeSchema.safeParse({
      title: 't',
      body: '  hi  ',
      audience: { type: 'ALL' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe('hi');
  });

  it('rejects an empty SELECTED list and a list over 500', () => {
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 't',
        body: 'b',
        audience: { type: 'SELECTED', inspectorIds: [] },
      }).success,
    ).toBe(false);
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 't',
        body: 'b',
        audience: { type: 'SELECTED', inspectorIds: Array.from({ length: 501 }, () => A) },
      }).success,
    ).toBe(false);
  });

  it('dedupes SELECTED inspectorIds', () => {
    const r = publishInspectorNoticeSchema.safeParse({
      title: 't',
      body: 'b',
      audience: { type: 'SELECTED', inspectorIds: [A, A, B] },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.audience.type === 'SELECTED') {
      expect(r.data.audience.inspectorIds).toEqual([A, B]);
    }
  });

  it('rejects an invalid SELECTED id', () => {
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 't',
        body: 'b',
        audience: { type: 'SELECTED', inspectorIds: ['x'] },
      }).success,
    ).toBe(false);
  });

  it('rejects REGION without a regionId and an unknown audience type', () => {
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 't',
        body: 'b',
        audience: { type: 'REGION' },
      }).success,
    ).toBe(false);
    expect(
      publishInspectorNoticeSchema.safeParse({
        title: 't',
        body: 'b',
        audience: { type: 'TENANT' },
      }).success,
    ).toBe(false);
  });

  it('strips unknown top-level keys', () => {
    const r = publishInspectorNoticeSchema.safeParse({
      title: 't',
      body: 'b',
      audience: { type: 'ALL' },
      foo: 1,
    });
    expect(r.success).toBe(true);
    if (r.success) expect('foo' in r.data).toBe(false);
  });
});

describe('pushSubscriptionSchema', () => {
  it('accepts a valid https subscription', () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BPublicKey', auth: 'authsecret' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-https endpoint', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'http://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'B', auth: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-push-service host and an IP literal (SSRF guard)', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://internal.local/x',
        keys: { p256dh: 'B', auth: 'x' },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://10.0.0.1/x',
        keys: { p256dh: 'B', auth: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects an endpoint over 2048 chars', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://ex.com/' + 'a'.repeat(2048),
        keys: { p256dh: 'B', auth: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects when keys.auth is missing', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://ex.com/a',
        keys: { p256dh: 'B' },
      }).success,
    ).toBe(false);
  });
});

describe('listInspectorNoticesQuerySchema', () => {
  it('defaults status to active and caps pageSize at 100', () => {
    const def = listInspectorNoticesQuerySchema.parse({});
    expect(def.status).toBe('active');
    expect(listInspectorNoticesQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listInspectorNoticesQuerySchema.parse({ status: 'archived' }).status).toBe('archived');
  });
});
