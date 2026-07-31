/**
 * Which variables a Handlebars template actually references.
 *
 * The template editor validates an operator's body against a per-code allow-list, so it
 * needs the same answer the renderer would give. It used to ask a naive
 * `/\{\{(\w+)\}\}/` — which reads `{{else}}` as a variable named `else`, so every template
 * carrying `{{#if x}}…{{else}}…{{/if}}` (all of the appointment emails, via SERVICE_LABEL)
 * was impossible to save.
 *
 * This mirrors the semantics of `TemplateRendererService.extractVariables`, which walks a
 * real Handlebars AST, without pulling the Handlebars parser into the web bundle. Where the
 * two could disagree this errs toward *not* reporting a name: a false "invalid variable"
 * blocks a save, while a missed one only forgoes a warning.
 */

/** Helpers the renderer registers. A name in helper position is never a variable. */
const HELPERS = new Set(['if', 'unless', 'each', 'with', 'lookup', 'log', 'formatDate', 'formatCurrency']);

/** Handlebars keywords and literals that look like identifiers but never resolve to a variable. */
const NON_VARIABLES = new Set(['this', 'true', 'false', 'null', 'undefined']);

/** Bare identifier. Dotted or indexed paths (`a.b`, `a.[0]`) are deliberately not reported. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A `{{ … }}` expression. Inner braces are excluded so `{{{raw}}}` still yields `raw`. */
const EXPRESSION = /\{\{([^{}]+)\}\}/g;

/**
 * `{{!-- … --}}` block comment. Stripped wholesale before scanning: its body may
 * contain `{{…}}` expressions, and those are commentary, not references. Left in
 * place they were reported as used — enough to fail an allow-list check over text
 * the renderer never evaluates.
 */
const BLOCK_COMMENT = /\{\{!--[\s\S]*?--\}\}/g;

export function extractTemplateVariables(text: string): string[] {
  if (!text) return [];

  const scannable = text.replace(new RegExp(BLOCK_COMMENT.source, 'g'), ' ');
  const found = new Set<string>();
  const regex = new RegExp(EXPRESSION.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(scannable)) !== null) {
    // `~` is whitespace control (`{{~x~}}`), not part of the path.
    let inner = match[1]?.replace(/^~+/, '').replace(/~+$/, '').trim() ?? '';

    // `{{! comment }}` and `{{/if}}` carry no references.
    if (inner.startsWith('!') || inner.startsWith('/')) continue;
    // `{{else}}` and `{{^}}` only split a block into its two programs.
    if (inner === 'else' || inner === '^') continue;
    // `{{else if x}}` — the chained condition is what matters.
    if (inner.startsWith('else ')) inner = inner.slice('else '.length).trim();
    // `{{#if x}}` and `{{^x}}` open a block; the path is still a real reference.
    if (inner.startsWith('#') || inner.startsWith('^')) inner = inner.slice(1).trim();

    for (const token of inner.split(/\s+/)) {
      if (!token || HELPERS.has(token) || NON_VARIABLES.has(token)) continue;
      if (!IDENTIFIER.test(token)) continue; // string/number literals, hash args, dotted paths
      found.add(token);
    }
  }

  return [...found];
}

export interface TemplateVariableIssues {
  /** Referenced names the template is not allowed to use. */
  invalid: string[];
  /** Names the spec requires the template to print, but that it never references. */
  missing: string[];
}

export function findTemplateVariableIssues(
  text: string,
  opts: { required: readonly string[]; allowed: readonly string[] },
): TemplateVariableIssues {
  const used = extractTemplateVariables(text);
  const allowed = new Set<string>(opts.allowed);
  const usedSet = new Set(used);

  return {
    invalid: used.filter((name) => !allowed.has(name)),
    missing: opts.required.filter((name) => !usedSet.has(name)),
  };
}
