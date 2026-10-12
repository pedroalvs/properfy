# PWA Design System

The PWA uses a shadcn-style design system: semantic HSL tokens, Tailwind utilities, and a
small set of composable primitives in `src/components/ui`. This document is the reference for
building UI that stays consistent. The `check:ds` guard (see the end) enforces the hard rules.

---

## 1. Tokens

Tokens live in `src/styles/tokens.css` and are wired into Tailwind in `tailwind.config.ts`.

### Primary palette — shadcn HSL tokens

Defined as bare HSL channels (`--primary: 221 83% 53%`) and consumed through Tailwind classes
with native opacity support (`bg-primary`, `text-primary-foreground`, `bg-primary/10`):

| Token | Use |
|---|---|
| `background` / `foreground` | Page background / default text |
| `card` / `card-foreground` | Card surface / text on cards |
| `popover` / `popover-foreground` | Popover / menu surfaces |
| `primary` / `primary-foreground` | Brand actions, highlights |
| `muted` / `muted-foreground` | Subtle surfaces / secondary text |
| `destructive` / `destructive-foreground` | Errors, destructive actions |
| `success` / `success-foreground` | Success states |
| `warning` / `warning-foreground` | Warnings (reuses the amber pill channels) |
| `border` / `input` / `ring` | Borders, inputs, focus rings |

### Status pills — `pill-*`

WCAG-safe bg+fg pairs for status chips: `pill-green`, `pill-amber`, `pill-blue`, `pill-red`,
`pill-gray` (e.g. `bg-pill-green text-pill-green-foreground`).

### Legacy domain tokens (do not convert casually)

A small set of domain colours remain as **function colours** consumed via inline `style` in
`src/lib/status-colors.ts`, keyed by domain enum: `status-*` (appointment status), `sg-*`
(service-group status), `confirmation-*` (tenant confirmation), `flow-*` (flow type) and
`text-primary`. These render correctly today; converting them means reworking
`status-colors.ts`, so leave them unless that is the explicit task.

### Deliberately-kept legacy brand tokens

`secondary` and `accent` keep their **legacy brand values** (dark teal), because some
not-yet-restyled screens use `text-secondary` as a heading colour — remapping them to a light
shadcn surface made those headings invisible. Use `muted`/`primary` for surfaces instead;
**never** remap `secondary` / `accent` / `text-secondary` / `bg-secondary` / `*-accent`.

### Font

**Inter**, self-hosted via `@fontsource-variable/inter` (imported in `main.tsx`). There is no
Google-Fonts / Nunito dependency.

---

## 2. Primitives (`src/components/ui`)

Reuse these rather than re-styling raw elements:

| Primitive | Purpose |
|---|---|
| `Button` | CVA-variant button (variants/sizes) |
| `Badge` | Small status/label badge |
| `Card` | Content surface |
| `Alert` / `AlertDescription` | Inline info/error callout |
| `Skeleton` | Loading placeholder |
| `Segmented` | Segmented control / tab switch |
| `Dialog` | Centred modal |
| `Sheet` | Bottom/side sheet modal |
| `Form` (kit) + `Input` / `PasswordInput` | RHF-bound form field kit and inputs |
| `MenuRow` / `MenuList` | Tappable settings/menu rows |
| `StatusChip` | Domain status chip (uses `status-colors.ts`) |
| `DateField` | Date input |
| `TimezonePicker` | Timezone selector |
| `StarRating` | Rating input/display |
| `PullToRefresh` | Pull-to-refresh wrapper for lists |

---

## 3. Form pattern

Forms use **React Hook Form + Zod**, validated against schemas from **`@properfy/shared`**:

1. Define/resolve the schema from `@properfy/shared` (do not re-declare validation locally).
2. `useForm({ resolver: zodResolver(schema) })`.
3. Compose fields with the `Form` kit + `Input` / `PasswordInput`.
4. Surface server/validation errors through `Alert`.

See `features/auth/pages/*` and `features/profile/components/*` for canonical examples.

---

## 4. Anti-pattern registry (do / don't)

| Do | Don't |
|---|---|
| Compose classes with `cn()` from `@properfy/frontend-standards` | Build a `className` from a template literal |
| Use design tokens (`bg-primary`, `text-muted-foreground`, `/opacity`) | Hard-code a hex colour (`text-[#2563EB]`) or raw palette value |
| Express component variants with `cva` | Branch on ad-hoc `className` string concatenation |
| Give interactive targets ≥ 44px (`min-h-touch` / `TOUCH_TARGET_PX`) | Ship sub-44px tap targets |
| Rely on `focus-visible` styles for keyboard users | Remove focus outlines |
| Use `Dialog` / `Sheet` for modals | Hand-roll overlay/modal markup |
| Name pages `*Page.tsx` | Introduce a `*Screen.tsx` file |
| Use `TIMING` / `Z_INDEX` from `@properfy/frontend-standards` | Sprinkle magic timers (`3000`) or `z-[150]` |
| Keep `secondary`/`accent`/domain `status-*` tokens as-is | Remap the invisibility-trap or domain tokens |

These are not stylistic preferences — several encode production incidents (invisible tokens
from #1041, heading invisibility from the `secondary` remap). The shared, non-visual half of
these rules lives in `@properfy/frontend-standards`.

---

## 5. `check:ds` guard

A fast, dependency-free CI guard (`scripts/check-ds.sh`) fails the build if any retired pattern
reappears:

- a `*Screen.tsx` filename under `src`
- a raw 6-digit hex colour inside a `className`
- a template-literal `className`
- a dropped/retired design token or migrated-away legacy class

Run it with:

```bash
pnpm --filter pwa check:ds
```

It runs alongside `lint` and `typecheck` in CI; keep it green.
