import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AuthUser } from '@/hooks/useAuth';
import {
  snoozeTotpSuggestion,
  isTotpSuggestionSnoozed,
  shouldSuggestTotp,
} from './totp-suggestion';

// jsdom does not reliably expose localStorage in this config, so install a small
// in-memory Storage stub to exercise the util's real storage path.
function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  vi.stubGlobal('localStorage', storage);
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    name: 'Op User',
    email: 'op@example.com',
    role: 'OP',
    tenantId: 't1',
    ...overrides,
  };
}

describe('totp-suggestion snooze', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is not snoozed before any dismissal', () => {
    expect(isTotpSuggestionSnoozed('u1')).toBe(false);
  });

  it('is snoozed right after a dismissal and stays so within 30 days', () => {
    snoozeTotpSuggestion('u1');
    expect(isTotpSuggestionSnoozed('u1')).toBe(true);
  });

  it('expires after 30 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    snoozeTotpSuggestion('u1');
    expect(isTotpSuggestionSnoozed('u1')).toBe(true);

    // 31 days later
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    expect(isTotpSuggestionSnoozed('u1')).toBe(false);
  });

  it('is per-user', () => {
    snoozeTotpSuggestion('u1');
    expect(isTotpSuggestionSnoozed('u2')).toBe(false);
  });
});

describe('shouldSuggestTotp', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suggests for a non-AM web role that is not enrolled and not snoozed', () => {
    expect(shouldSuggestTotp(makeUser({ role: 'OP' }))).toBe(true);
    expect(shouldSuggestTotp(makeUser({ role: 'CL_ADMIN' }))).toBe(true);
    expect(shouldSuggestTotp(makeUser({ role: 'CL_USER' }))).toBe(true);
  });

  it('does not suggest for AM (mandatory flow handles them)', () => {
    expect(shouldSuggestTotp(makeUser({ role: 'AM' }))).toBe(false);
  });

  it('does not suggest for INSP or TNT (not web-portal roles)', () => {
    expect(shouldSuggestTotp(makeUser({ role: 'INSP' }))).toBe(false);
    expect(shouldSuggestTotp(makeUser({ role: 'TNT' }))).toBe(false);
  });

  it('does not suggest when already enrolled', () => {
    expect(shouldSuggestTotp(makeUser({ role: 'OP', totpEnabled: true }))).toBe(false);
  });

  it('treats unknown enrollment (not yet hydrated) as a candidate', () => {
    expect(shouldSuggestTotp(makeUser({ role: 'OP', totpEnabled: undefined }))).toBe(true);
  });

  it('does not suggest when snoozed', () => {
    snoozeTotpSuggestion('u1');
    expect(shouldSuggestTotp(makeUser({ id: 'u1', role: 'OP' }))).toBe(false);
  });

  it('does not suggest for a null user', () => {
    expect(shouldSuggestTotp(null)).toBe(false);
  });
});
