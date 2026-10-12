#!/usr/bin/env bash
#
# Design-system guard. Fails (exit 1) if any pattern this PWA deliberately retired
# reappears in the source. Fast, dependency-free, CI-friendly: run via `pnpm check:ds`.
# Run from the app root (apps/pwa); scans ./src.
#
set -uo pipefail

# Scan root. Defaults to ./src; overridable (CHECK_DS_SRC) so the guard's own tests
# can point it at a throwaway fixtures tree.
SRC="${CHECK_DS_SRC:-src}"
fail=0

report() {
  fail=1
  echo "✗ $1"
  # Indent the offending matches for readability.
  printf '%s\n' "$2" | sed 's/^/    /'
}

# 1. No `*Screen.tsx` component/page/test files — pages are `*Page.tsx`.
screens=$(find "$SRC" -name '*Screen*.tsx' 2>/dev/null)
if [ -n "$screens" ]; then
  report "Found *Screen.tsx file(s) under $SRC (rename to *Page.tsx):" "$screens"
fi

# 2. No raw 6-digit hex colour inside a className — use design tokens, never literals.
hex=$(grep -rnE "className=.*#[0-9a-fA-F]{6}" "$SRC" --include='*.tsx' 2>/dev/null)
if [ -n "$hex" ]; then
  report "Found raw 6-digit hex colour inside a className (use a token):" "$hex"
fi

# 3. No template-literal className — compose with cn() from @properfy/frontend-standards.
tmpl=$(grep -rnE 'className=\{`' "$SRC" --include='*.tsx' 2>/dev/null)
if [ -n "$tmpl" ]; then
  report "Found template-literal className (compose with cn()):" "$tmpl"
fi

# 4. No deleted/retired design tokens (orphans dropped in the PR 5 sweep, and the legacy
#    brand classes migrated to shadcn tokens). These must not come back.
RETIRED='shimmer-from|shimmer-via|shimmer-to|border-subtle|border-light|hover-row|text-inactive|snackbar-error|btn-secondary-bg|btn-secondary-hover|btn-secondary-active|card-bg|text-disabled|disabled-bg|disabled-text|status-scheduled-text|status-done-text|status-awaiting-text|type-residential|type-commercial|type-industrial|type-rural|text-text-primary|text-text-secondary|text-text-muted|bg-app-bg|bg-info|bg-error|text-error|border-error|(bg|text|ring|shadow|border|from|via|to|fill|stroke)-(real-estate|realty)'
tokens=$(grep -rnE "$RETIRED" "$SRC" --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null)
if [ -n "$tokens" ]; then
  report "Found retired design token(s)/legacy class(es):" "$tokens"
fi

# Helper: drop test files from a grep result (BSD-grep-safe — no --exclude-dir).
drop_tests() { grep -vE '(/__tests__/|\.test\.(ts|tsx):)'; }

# 5. No raw Tailwind palette colour class (defence-in-depth alongside the ESLint
#    no-restricted-syntax rule; this grep also catches palette strings in object maps
#    the AST rule doesn't see). Tests are excluded.
PALETTE_RE='(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]'
palette=$(grep -rnE "$PALETTE_RE" "$SRC" --include='*.tsx' --include='*.ts' 2>/dev/null | drop_tests)
if [ -n "$palette" ]; then
  report "Found raw Tailwind palette colour (use a design-system token):" "$palette"
fi

# 6. No arbitrary z-index `z-[…]` — use Z_INDEX from @properfy/frontend-standards.
zidx=$(grep -rnE 'z-\[' "$SRC" --include='*.tsx' --include='*.ts' 2>/dev/null | drop_tests)
if [ -n "$zidx" ]; then
  report "Found arbitrary z-index z-[…] (use Z_INDEX from @properfy/frontend-standards):" "$zidx"
fi

# 7. No bare magic-number setTimeout delay — use TIMING from @properfy/frontend-standards.
#    Scoped to the setTimeout second arg; a plain `0` (next-tick idiom) is allowed, as
#    are TIMING.* / variable delays. Uses perl (-0777 whole-file slurp) so the match
#    spans multi-line callbacks and stays portable across BSD/GNU toolchains.
timer_hits=""
while IFS= read -r f; do
  case "$f" in */__tests__/*|*.test.ts|*.test.tsx) continue ;; esac
  if ! perl -0777 -ne 'exit(1) if /setTimeout\([\s\S]{0,200}?,\s*[1-9][0-9]*\s*\)/' "$f" 2>/dev/null; then
    timer_hits="${timer_hits}${f}"$'\n'
  fi
done < <(grep -rl 'setTimeout(' "$SRC" --include='*.tsx' --include='*.ts' 2>/dev/null)
if [ -n "$timer_hits" ]; then
  report "Found bare magic-number setTimeout delay (use TIMING from @properfy/frontend-standards):" "$timer_hits"
fi

# 8. No hand-rolled `fixed inset-0` overlay in FEATURE code — use the sanctioned
#    Dialog/Sheet primitives under components/ui (which are not scanned here).
overlay=$(grep -rnE 'fixed inset-0' "$SRC/features" --include='*.tsx' 2>/dev/null | drop_tests)
if [ -n "$overlay" ]; then
  report "Found hand-rolled 'fixed inset-0' overlay in feature code (use a components/ui Dialog/Sheet):" "$overlay"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "check:ds failed — see above."
  exit 1
fi

echo "check:ds passed — no retired design-system patterns found."
