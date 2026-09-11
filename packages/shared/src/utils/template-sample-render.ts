/**
 * Render a Handlebars template body by substituting a flat map of sample values —
 * FOR MEASUREMENT ONLY, never for delivery. The real send uses the backend's
 * Handlebars renderer; this exists so the web editor and the backend save-guard
 * can estimate a rendered SMS length with identical rules, without pulling the
 * Handlebars parser into the web bundle.
 *
 * It mirrors the spirit of `extractTemplateVariables`: where it might disagree
 * with real Handlebars it errs SHORT (drops text), because the length guard must
 * never block a save on a guess that over-counts.
 *
 * Supported: `{{! }}` / `{{!-- --}}` comments, `{{#if x}}…{{else}}…{{/if}}`,
 * `{{#unless x}}…{{/unless}}` (truthy = the sample value is a non-empty string,
 * resolved innermost-first so nesting works), `{{x}}` / `{{{x}}}` (with optional
 * `~` whitespace control). Any other `{{…}}` (helpers, `{{#each}}`) is dropped.
 */

const LINE_COMMENT = /\{\{![^{}]*\}\}/g;
const BLOCK_COMMENT = /\{\{!--[\s\S]*?--\}\}/g;

// An innermost if/unless block: its body is a tempered match that stops before
// any further block-open, so repeated application resolves inside-out.
const INNER_BLOCK =
  /\{\{~?#(if|unless)\s+([\w.]+)\s*~?\}\}((?:(?!\{\{~?#(?:if|unless)\b)[\s\S])*?)\{\{~?\/\1~?\}\}/;
const ELSE_SPLIT = /\{\{~?else~?\}\}/;

const TRIPLE_VAR = /\{\{\{\s*~?\s*([\w.]+)\s*~?\s*\}\}\}/g;
const DOUBLE_VAR = /\{\{\s*~?\s*([\w.]+)\s*~?\s*\}\}/g;
const LEFTOVER_TRIPLE = /\{\{\{[\s\S]*?\}\}\}/g;
const LEFTOVER_DOUBLE = /\{\{[\s\S]*?\}\}/g;

function isTruthy(vars: Record<string, string>, key: string): boolean {
  const value = vars[key];
  return typeof value === 'string' && value.trim().length > 0;
}

export function renderTemplateWithSamples(text: string, vars: Record<string, string>): string {
  if (!text) return '';

  let out = text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');

  // Resolve if/unless innermost-first until none remain (guard against runaway).
  for (let i = 0; i < 1000; i += 1) {
    const match = INNER_BLOCK.exec(out);
    if (!match) break;
    const [full = '', kind = '', cond = '', body = ''] = match;
    const [thenPart = '', elsePart = ''] = body.split(ELSE_SPLIT);
    const truthy = isTruthy(vars, cond);
    const keep = kind === 'unless' ? !truthy : truthy;
    out = out.slice(0, match.index) + (keep ? thenPart : elsePart) + out.slice(match.index + full.length);
  }

  out = out
    .replace(TRIPLE_VAR, (_, key: string) => vars[key] ?? '')
    .replace(DOUBLE_VAR, (_, key: string) => vars[key] ?? '');

  // Drop anything left (helpers, {{#each}}, unbalanced tags) — err short.
  return out.replace(LEFTOVER_TRIPLE, '').replace(LEFTOVER_DOUBLE, '');
}
