#!/usr/bin/env bash
#
# Design-system guard. Fails (exit 1) if any pattern this PWA deliberately retired
# reappears in the source. Fast, dependency-free, CI-friendly: run via `pnpm check:ds`.
# Run from the app root (apps/pwa); scans ./src.
#
set -uo pipefail

SRC="src"
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

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "check:ds failed — see above."
  exit 1
fi

echo "check:ds passed — no retired design-system patterns found."
