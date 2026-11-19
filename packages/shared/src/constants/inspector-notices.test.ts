import { describe, expect, it } from 'vitest';
import {
  INSPECTOR_CHALLENGES_PATH,
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
  COMPLETION_REMINDER_DEDUPE_PREFIX,
  buildCompletionReminderDedupeKey,
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
  it('has exactly the four patterns (F04 appended /today, F08 appended /profile/challenges)', () => {
    expect([...INSPECTOR_NOTICE_TARGET_PATTERNS]).toEqual([
      '/profile/announcements/:id',
      '/schedule/:id',
      '/today',
      '/profile/challenges',
    ]);
  });

  it('accepts the valid shapes', () => {
    expect(isAllowedInspectorNoticeTargetPath(`/profile/announcements/${UUID}`)).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}`)).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath('/today')).toBe(true); // F04 route notices
  });

  it('rejects wrong shapes', () => {
    expect(isAllowedInspectorNoticeTargetPath('/schedule/abc')).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}/x`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(`/schedule/${UUID}?a=1`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath(`https://evil.example/schedule/${UUID}`)).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath('//evil.example')).toBe(false);
    expect(isAllowedInspectorNoticeTargetPath('')).toBe(false);
  });

  it('matches /today only as the exact static pattern (F02 D24)', () => {
    expect(isAllowedInspectorNoticeTargetPath('/today')).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath('/today/')).toBe(false); // trailing slash
    expect(isAllowedInspectorNoticeTargetPath('/Today')).toBe(false); // case-sensitive
    expect(isAllowedInspectorNoticeTargetPath('//today')).toBe(false); // double slash
    expect(isAllowedInspectorNoticeTargetPath('/today#x')).toBe(false); // fragment
    expect(isAllowedInspectorNoticeTargetPath('/today?x=1')).toBe(false); // query
    expect(isAllowedInspectorNoticeTargetPath('/today/x')).toBe(false); // extra segment
    expect(isAllowedInspectorNoticeTargetPath(`/today/route/2026-11-05`)).toBe(false); // route child
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

  it('matches /profile/challenges only as the exact static pattern (F08, DR7/L-F02-08)', () => {
    expect(INSPECTOR_CHALLENGES_PATH).toBe('/profile/challenges');
    expect(isAllowedInspectorNoticeTargetPath('/profile/challenges')).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath(INSPECTOR_CHALLENGES_PATH)).toBe(true);
    expect(isAllowedInspectorNoticeTargetPath('/profile/challenges/')).toBe(false); // trailing slash
    expect(isAllowedInspectorNoticeTargetPath('/profile/challenges/x')).toBe(false); // extra segment
    expect(isAllowedInspectorNoticeTargetPath('/profile/challengesx')).toBe(false); // not the exact segment
    expect(isAllowedInspectorNoticeTargetPath('/Profile/Challenges')).toBe(false); // case-sensitive
    expect(isAllowedInspectorNoticeTargetPath('/profile/challenges?tab=ranking')).toBe(false); // query
    expect(isAllowedInspectorNoticeTargetPath('/profile/challenges#x')).toBe(false); // fragment
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
    expect(resolveInspectorNoticeTargetPath('n1', '/today')).toBe('/today'); // F04 route notices
  });

  it('falls back when the target is not allowed', () => {
    expect(resolveInspectorNoticeTargetPath('n1', '/today/route/2026-11-05')).toBe(
      '/profile/announcements/n1',
    );
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

describe('inspector notices dedupe (F03 completion reminder)', () => {
  it('exposes the completion-reminder dedupe prefix', () => {
    expect(COMPLETION_REMINDER_DEDUPE_PREFIX).toBe('completion-reminder');
  });

  it('builds a stable completion-reminder dedupe key per appointment, civil date and inspector', () => {
    expect(
      buildCompletionReminderDedupeKey({
        appointmentId: 'a1',
        civilDate: '2026-11-03',
        inspectorId: 'i1',
      }),
    ).toBe('completion-reminder:a1:2026-11-03:i1');
  });

  it('includes the inspector so a re-offer to a different inspector gets its own reminder', () => {
    const base = { appointmentId: 'a1', civilDate: '2026-11-03' };
    expect(buildCompletionReminderDedupeKey({ ...base, inspectorId: 'i1' })).not.toBe(
      buildCompletionReminderDedupeKey({ ...base, inspectorId: 'i2' }),
    );
  });
});
