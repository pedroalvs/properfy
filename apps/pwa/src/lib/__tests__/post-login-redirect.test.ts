import {
  buildCurrentRedirectTarget,
  clearPostLoginRedirect,
  consumePostLoginRedirect,
  readPostLoginRedirect,
  savePostLoginRedirect,
} from '../post-login-redirect';

describe('pwa post-login redirect helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and consumes a safe internal route', () => {
    savePostLoginRedirect('/schedule/123?tab=details#photos');
    expect(readPostLoginRedirect()).toBe('/schedule/123?tab=details#photos');
    expect(consumePostLoginRedirect()).toBe('/schedule/123?tab=details#photos');
    expect(readPostLoginRedirect()).toBeNull();
  });

  it('ignores login and external routes', () => {
    savePostLoginRedirect('/login');
    expect(readPostLoginRedirect()).toBeNull();

    savePostLoginRedirect('https://example.com');
    expect(readPostLoginRedirect()).toBeNull();
  });

  it('builds the current path including search and hash', () => {
    expect(
      buildCurrentRedirectTarget({ pathname: '/execution/1', search: '?step=photos', hash: '#camera' } as Location),
    ).toBe('/execution/1?step=photos#camera');
  });

  it('clears persisted redirect', () => {
    savePostLoginRedirect('/schedule');
    clearPostLoginRedirect();
    expect(readPostLoginRedirect()).toBeNull();
  });
});
