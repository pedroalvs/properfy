# Quickstart: F04-3 PWA Day Screen

## Prereqs

- Worktree on `053-f04-3-pwa-day-screen` (from `origin/develop` ≥ PR #1331).
- `pnpm install`; `pnpm --filter @properfy/shared build`; `pnpm --filter @properfy/frontend-standards build`; `pnpm --filter backend exec prisma generate` (shared/FS `dist` are required by the PWA; Vite resolves them from `dist`, not source).

## Run the PWA against a backend

```bash
pnpm --filter backend dev          # with the F04 Mapbox stub, or point at staging
pnpm --filter pwa dev              # http://localhost:5173
```

Log in as an inspector who has a published plan for "tomorrow" (or publish one via the OP recalculate). You should land on `/today`.

## Verification (run inside the worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test        # inspector-notices + format-display-date
pnpm --filter pwa lint
pnpm --filter pwa typecheck
pnpm --filter pwa test
pnpm --filter pwa build
pnpm --filter pwa check:ds
pnpm --filter backend test -- day-plan inspector-notice
git diff --stat origin/develop... | tail -1   # must be ≤ 150 files
grep -n "from F04" apps/pwa/CLAUDE.md          # must be empty (X00 L-X00-04)
grep -n "api-day-plan-cache" apps/pwa/CLAUDE.md # must be ≥ 1
```

TZ-dependent suites also run with `TZ=America/Los_Angeles` (set in the test harness / rerun locally to confirm).

## Manual QA (checklist in the PR, no screenshots committed)

Q1 login→`/today`, bar Today/Schedule/Offers/More · Q2 Today cards · Q3 Navigate Apple/Google · Q4 Check in/out from card · Q5 Can't-do removes stop · Q6 Route summary + change origin + revert · Q7 no-base link focuses the base card · Q8 "ready at 7:30 pm" → push opens `/today` · Q9 PDF/XLSX download · Q10 More hub + badge + announcement push unchanged · Q11 More active on `/earnings` and `/profile/*` · Q12 airplane-mode cached plan + logout clears it · Q13 iPad two-pane scroll · Q14 notch safe-area · Q15 VoiceOver/TalkBack names · Q16 (L-F04-07/08) "Continuing from" no pencil + "Call … (role)".

## Smallest end-to-end slice to demo

1. Published plan with 3 stops → Today shows greeting, "0 of 3 done · finish ~", Next card with Navigate + Check in, Coming up (2), tomorrow card.
2. Tap "View and reorder all 3 stops" → Route list with legs and OriginRow.
3. Change the day's base → ETAs update, "(this day only)" appears; "Use my base address" reverts.
4. Download the PDF sheet.
