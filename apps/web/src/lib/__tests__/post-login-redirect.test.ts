import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCurrentRedirectTarget,
  clearPostLoginRedirect,
  consumePostLoginRedirect,
  readPostLoginRedirect,
  savePostLoginRedirect,
} from '../post-login-redirect';

describe('web post-login redirect helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and consumes a safe internal route', () => {
    savePostLoginRedirect('/appointments/123?tab=timeline');
    expect(readPostLoginRedirect()).toBe('/appointments/123?tab=timeline');
    expect(consumePostLoginRedirect()).toBe('/appointments/123?tab=timeline');
    expect(readPostLoginRedirect()).toBeNull();
  });

  it('rejects login and public portal routes', () => {
    savePostLoginRedirect('/login');
    expect(readPostLoginRedirect()).toBeNull();

    savePostLoginRedirect('/tenant-portal/abc');
    expect(readPostLoginRedirect()).toBeNull();
  });

  it('builds the current path including search and hash', () => {
    expect(
      buildCurrentRedirectTarget({ pathname: '/reports', search: '?status=PROCESSING', hash: '#jobs' } as Location),
    ).toBe('/reports?status=PROCESSING#jobs');
  });

  it('clears persisted redirect', () => {
    savePostLoginRedirect('/dashboard');
    clearPostLoginRedirect();
    expect(readPostLoginRedirect()).toBeNull();
  });
});
