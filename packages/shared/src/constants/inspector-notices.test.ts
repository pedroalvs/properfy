import { describe, expect, it } from 'vitest';
import {
  INSPECTOR_NOTICE_SMS_MAX_CHARS,
  INSPECTOR_NOTICE_TARGET_PATTERNS,
  SYSTEM_INSPECTOR_NOTICE_TYPES,
  buildInspectorNoticeSmsMessage,
  getInspectorNoticeDeliverExpireMinutes,
  inspectorNoticeDeepLink,
  isAllowedInspectorNoticeTargetPath,
  isAllowedPushEndpoint,
  isCriticalSystemNoticeType,
  resolveInspectorNoticeTargetPath,
} from './inspector-notices';

const UUID = '11111111-2222-4333-8444-555555555555'; // valid v4, lowercase
const UUID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('system notice types + criticality', () => {
  it('marks the three system criticals', () => {
    expect(isCriticalSystemNoticeType('ROUTE_PUBLISHED')).toBe(true);
    expect(isCriticalSystemNoticeType('ROUTE_CHANGED')).toBe(true);
    expect(isCriticalSystemNoticeType('COMPLETION_REMINDER')).toBe(true);
  });

  it('performance messages are never critical', () => {
    expect(isCriticalSystemNoticeType('PERFORMANCE_MESSAGE')).toBe(false);
  });

  it('exposes exactly the four system types', () => {
    expect([...SYSTEM_INSPECTOR_NOTICE_TYPES]).toEqual([
      'ROUTE_PUBLISHED',
      'ROUTE_CHANGED',
      'COMPLETION_REMINDER',
      'PERFORMANCE_MESSAGE',
    ]);
  });
});

describe('target patterns + allowlist', () => {
  it('has exactly the two patterns', () => {
    expect([...INSPECTOR_NOTICE_TARGET_PATTERNS]).toEqual([
      '/profile/announcements/:id',
      '/schedule/:id',
    ]);
  });

  it('accepts the two valid shapes', () => {
    expect(isAllowedInspectorNoticeTargetPath(`/profile/announcements/${UUID}`)).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}`)).toBe(true);
  });

  it('rejects wrong shapes', () => {
    expect(isAllowedInspectorNoticeTargetPath('/schedule/abc')).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}/x`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}?a=1`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath('/today')).toBe(false); // only with F04
    expect(isAllowedInspectorNoticeTargetPath(`https://evil.example/schedule/${UUID}`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath('//evil.example')).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath('')).toBe(false);
  });

  it('rejects the L-F02-08 negatives', () => {
    expect(isAllowedInspectorNoticeTargetPath(`/profile/announcements/${UUID}/`)).toBe(false); // trailing slash
    expect(isAllowedInspectorNoticeTargetPath(`/Schedule/${UUID}`)).toBe(false); // case-sensitive literal
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID2.toUpperCase()}`)).toBe(false); // uppercase uuid
    expect(isAllowedInspectorNoticeTargetPath('/schedule/%2e%2e')).toBe(false); // percent
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}\\x`)).toBe(false); // backslash
    expect(isAllowedInspectorNoticeTargetPath(`/schedule//${UUID}`)).toBe(false); // double slash
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}#a`)).toBe(false); // fragment
  });

  it('rejects over-length paths and accepts a lowercase v4', () => {
    expect(isAllowedInspectorNoticeTargetPath('/schedule/' + 'a'.repeat(191))).toBe(false); // 201 chars
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID2}`)).toBe(true);
  });

  it('rejects version-0 uuid', () => {
    expect(
      isAllowedInspectorNoticeTargetPath('/schedule/00000000-0000-0000-0000-000000000000'),
    ).toBe(false);
  });

  it('returns false (no throw) for non-string input', () => {
    expect(isAllowedInspectorNoticeTargetPath(null)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(undefined)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(123)).toBe(false);
  });
});

describe('resolveInspectorNoticeTargetPath', () => {
  it('defaults to the announcements deep link', () => {
    expect(resolveInspectorNoticeTargetPath('n1', undefined)).toBe('/profile/announcements/n1');
    expect(resolveInspectorNoticeTargetPath('n1', null)).toBe('/profile/announcements/n1');
  });

  it('keeps a valid target path', () => {
    expect(resolveInspectorNoticeTargetPath('n1', `/schedule/${UUID}`)).toBe(`/schedule/${UUID}`);
  });

  it('falls back when the target is not allowed', () => {
    expect(resolveInspectorNoticeTargetPath('n1', '/today')).toBe('/profile/announcements/n1');
  });
});

describe('inspectorNoticeDeepLink', () => {
  it('builds the announcements path', () => {
    expect(inspectorNoticeDeepLink('abc')).toBe('/profile/announcements/abc');
  });
});

describe('isAllowedPushEndpoint (SSRF guard)', () => {
  it('accepts the major push service hosts over https', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://abc.notify.windows.com/x')).toBe(true);
  });

  it('rejects other hosts, IP literals, http, and non-strings', () => {
    expect(isAllowedPushEndpoint('https://internal.local/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil-fcm.googleapis.com.attacker.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://10.0.0.1/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://[::1]/x')).toBe(false);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
  });
});

describe('getInspectorNoticeDeliverExpireMinutes', () => {
  it('scales by recipient count with a floor of 15', () => {
    expect(getInspectorNoticeDeliverExpireMinutes(2)).toBe(15);
    expect(getInspectorNoticeDeliverExpireMinutes(150)).toBe(15);
    expect(getInspectorNoticeDeliverExpireMinutes(500)).toBe(22);
  });
});

describe('buildInspectorNoticeSmsMessage', () => {
  it('joins title and body with a sentence period', () => {
    expect(buildInspectorNoticeSmsMessage('Road closure', 'Pacific Hwy closed')).toBe(
      'Properfy: Road closure. Pacific Hwy closed',
    );
  });

  it('does not double punctuation when the title already ends in . ! ?', () => {
    expect(buildInspectorNoticeSmsMessage('Heads up!', 'Check the app')).toBe(
      'Properfy: Heads up! Check the app',
    );
  });

  it('collapses newlines in the body to single spaces', () => {
    expect(buildInspectorNoticeSmsMessage('T', 'line one\nline two')).toBe(
      'Properfy: T. line one line two',
    );
  });

  it('truncates to <= 300 chars ending with the app hint', () => {
    const out = buildInspectorNoticeSmsMessage('Title', 'x'.repeat(400));
    expect(out.length).toBeLessThanOrEqual(INSPECTOR_NOTICE_SMS_MAX_CHARS);
    expect(out.endsWith('… Open the Properfy app.')).toBe(true);
  });
});
