# Phase 1 Data Model: PWA App Tour

This feature adds **no database entity** and **no API field**. The entities below are client-side only.

## TourStep (in-memory, pure)

The unit the engine renders. Produced by `resolveTourSteps(...)`, filtered at runtime by target presence.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'target' \| 'install'` | `install` has no anchor and renders centered |
| `anchor` | `string \| undefined` | `data-tour` selector key for `target` steps (e.g. `nav-today`) |
| `title` | `string` | literal (FR-008/009) |
| `body` | `string` | ≤ 140 chars, English (empty for `install`; `InstallStepBody` renders its copy) |

**Resolution rules**:
- `resolveTourSteps({ isStandalone })` includes all 8 target steps always, and the install step iff `!isStandalone`. (The install step's platform copy is decided by `InstallStepBody` via `useInstallPrompt`, not by `resolveTourSteps`.)
- The *component* skips any `target` step at runtime when its anchor is absent/zero-size (uniformly — there is no per-step "always" exemption, since the test matrix requires even a nav step to be skipped if its anchor is missing), and recomputes the displayed total `n`.
- Counts: 9 (browser) / 8 (standalone); if all target anchors are absent and standalone → engine finishes without rendering.

**Ordered anchors** (target steps): `nav-today`, `today-next`, `today-next-actions`, `today-more-actions`, `today-route-link`, `nav-schedule`, `nav-offers`, `nav-more`.

## TourGeometry (in-memory, pure — `tour-geometry.ts`)

Input: target `DOMRect` (or none), viewport `{width,height}`, insets `{safeTop,safeBottom}`, padding.
Output:
| Field | Type | Notes |
|---|---|---|
| `spotlight` | `{x,y,w,h}` | target rect expanded by padding; omitted for centered step |
| `placement` | `'top' \| 'bottom' \| 'center'` | balloon side; `center` for install / no target |
| `balloon` | `{left, top}` | clamped ≥16px gutters, never inside insets |
| `isTargetVisible` | `boolean` | false for 0×0 or off-document target |

## OnboardingState (read-only, from server)

Read via `useInspectorMe` (query key `['inspector','me',userId]`).
| Field | Type | Notes |
|---|---|---|
| `onboardingCompletedAt` | `string \| null` | ISO instant; `null` = not completed. Added by TASK-F04-2. The only field this feature reads for its decision. |

Transition (server-owned): `null` → ISO timestamp, written once by the app-state POST carrying `onboardingCompleted: true` (server `COALESCE`, idempotent across devices). This feature never writes the column directly.

## LocalCompletionRecord (browser `localStorage`)

Key `properfy.pwa.tourCompletedPending`, value = `userId` string.
| State | Meaning | Effect |
|---|---|---|
| absent | no pending completion | normal open logic applies |
| present = current userId | completion POST not yet confirmed | tour does not auto-open; retry POST on next mount / `online` |
| present = other userId | stale (different user) | ignored; current user may still see the tour |

Lifecycle: written on POST failure (offline/5xx/429), cleared on POST success path (and on logout via `clearTokens`). Access is try/catch-wrapped; a throwing `localStorage` degrades to a module-level "opened this load" flag.
