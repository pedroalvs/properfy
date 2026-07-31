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

/** Trailing block-parameter declaration, as in `{{#each rows as |row index|}}`. */
const BLOCK_PARAMS = /\s+as\s+\|[^|]*\|\s*$/;

/** The same declaration, found anywhere, to collect the alias names it introduces. */
const BLOCK_PARAMS_ANYWHERE = /\bas\s+\|([^|]*)\|/g;

/**
 * Names bound by `as |…|` anywhere in the template. Collected up front and
 * excluded everywhere rather than tracked per block: an alias is loop-local, so
 * reporting `{{row}}` inside `{{#each rows as |row|}}` produced
 * "Invalid variables: row" and blocked a save the renderer would have accepted.
 *
 * The flat set can also mask a real variable that happens to share an alias
 * name. That direction is deliberate — under-reporting only forgoes a warning,
 * while over-reporting refuses valid content, which is the failure this module
 * exists to prevent.
 */
function collectBlockAliases(text: string): Set<string> {
  const aliases = new Set<string>();
  const regex = new RegExp(BLOCK_PARAMS_ANYWHERE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    for (const name of (match[1] ?? '').trim().split(/\s+/)) {
      if (name) aliases.add(name);
    }
  }
  return aliases;
}

export function extractTemplateVariables(text: string): string[] {
  if (!text) return [];

  const scannable = text.replace(new RegExp(BLOCK_COMMENT.source, 'g'), ' ');
  const aliases = collectBlockAliases(scannable);
  const found = new Set<string>();
  const regex = new RegExp(EXPRESSION.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(scannable)) !== null) {
    // `~` is whitespace control (`{{~x~}}`), not part of the path.
    let inner = match[1]?.replace(/^~+/, '').replace(/~+$/, '').trim() ?? '';

    // `{{! comment }}` and `{{/if}}` carry no references.
    if (inner.startsWith('!') || inner.startsWith('/')) continue;
    // `{{> name}}` names a partial; only its context arguments are references.
    if (inner.startsWith('>')) inner = inner.slice(1).trim().split(/\s+/).slice(1).join(' ');
    // `{{else}}` and `{{^}}` only split a block into its two programs.
    if (inner === 'else' || inner === '^') continue;
    // `{{else if x}}` — the chained condition is what matters.
    if (inner.startsWith('else ')) inner = inner.slice('else '.length).trim();
    // `{{#if x}}` and `{{^x}}` open a block; the path is still a real reference.
    if (inner.startsWith('#') || inner.startsWith('^')) inner = inner.slice(1).trim();
    // `{{#each rows as |row index|}}` declares local aliases. Neither the `as`
    // keyword nor the names between the pipes are payload variables.
    inner = inner.replace(BLOCK_PARAMS, '');

    for (const token of inner.split(/\s+/)) {
      if (!token || HELPERS.has(token) || NON_VARIABLES.has(token) || aliases.has(token)) continue;
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
