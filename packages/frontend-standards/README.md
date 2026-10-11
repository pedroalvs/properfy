# @properfy/frontend-standards

The shared, **non-visual** frontend standards layer for Properfy. It codifies the conventions
that keep the web and PWA frontends consistent — class composition, variant authoring, shared
constants and the ESLint rules that enforce them — **without shipping any app visuals**.

Because it contains no colours, spacing or component styling, both `apps/web` and `apps/pwa`
can adopt it without changing a single pixel.

## Exports

### `.` (main entry)

| Export | What it is |
|---|---|
| `cn(...inputs)` | Class-name composer (`clsx` + `tailwind-merge`). The sanctioned way to build a `className`; never use template literals. |
| `type ClassValue` | The input type accepted by `cn`. |
| `cva`, `type VariantProps` | Re-exported from `class-variance-authority`. The sanctioned way to express component variants, re-exported here so every app imports it from one place. |
| `TIMING` | Named timing constants in ms (`toastDismiss`, `flashMessage`, `debounceInput`) — replaces magic timers. |
| `Z_INDEX` | Named z-index scale (`base`, `dropdown`, `sticky`, `overlay`, `modal`, `toast`) — replaces arbitrary `z-[n]`. |
| `TOUCH_TARGET_PX` | Minimum interactive target size (`44`), per WCAG 2.5.5 / mobile touch guidance. |

```ts
import { cn, cva, type VariantProps, TIMING, Z_INDEX, TOUCH_TARGET_PX } from '@properfy/frontend-standards';
```

### `./eslint`

A shareable ESLint rule fragment. Spread its `rules` into an app's ESLint config to enforce the
codified conventions (currently: ban hand-built template-literal `className`s — compose with
`cn()` instead). The fragment sets the rule at `error`; it grows as the design-system migration
lands each guard.

```js
// .eslintrc.cjs
const properfy = require('@properfy/frontend-standards/eslint');

module.exports = {
  rules: {
    ...properfy.rules,
    // app-specific rules…
  },
};
```

`apps/pwa` consumes this fragment at `error` (its source is fully migrated). `apps/web` may
adopt it the same way once its remaining template-literal classNames are migrated — again,
with no visual change.

## Scripts

```bash
pnpm --filter @properfy/frontend-standards build      # bundle via tsup
pnpm --filter @properfy/frontend-standards test       # vitest
pnpm --filter @properfy/frontend-standards typecheck
```
