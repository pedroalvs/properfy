# E2E baseline contract (FR-025, L-X03-05)

The PWA E2E harness (`apps/pwa/tests/e2e/support/auth.ts`, recovered in X03 #1312) registers `blockUnmockedApi` plus a `BASELINE_STUBS` set on `loginAsInspector`. Today it stubs only `GET /v1/me`.

## Required change (same PR as the heartbeat)

Add two default stubs so every authenticated-boot spec stays hermetic:

```ts
export const BASELINE_STUBS: ReadonlyArray<{ path: string; body: unknown; status?: number }> = [
  { path: '/v1/me', body: INSPECTOR_ME },
  { path: '/v1/inspectors/me/app-state', body: null, status: 204 },
  { path: '/v1/inspectors/me', body: { data: { /* located base: baseLat set */ } } },
];
```

- The heartbeat fires from `PwaLayout` on every authenticated mount, so it belongs in the shared baseline (not per-spec).
- `GET /v1/inspectors/me` **also** joins the baseline: F01-3 mounts `BaseAddressBanner` on the Schedule home (not only Profile), so this query now runs on every authenticated boot. Its default body carries a located base (`baseLat` set) so the banner is hidden by default and existing schedule specs are unchanged; a spec exercising the missing/legacy-base states overrides it (last-route-wins). This supersedes the pre-F01-3 note that treated `/v1/inspectors/me` as a profile-only query.
- The handoff comment at the top of `auth.ts` (left by X03) is updated to reflect both stubs joining the baseline.

## Verification

- `pnpm --filter pwa exec playwright test` (or the CI `test-pwa-e2e` job) passes on Chromium + WebKit with no request escaping `blockUnmockedApi`.
- Confirm `stubJson(page, '/v1/inspectors/me/app-state', null, 204)` serves a 204 (check `support/api.ts` handles the `status` override and a null/empty body for 204).
