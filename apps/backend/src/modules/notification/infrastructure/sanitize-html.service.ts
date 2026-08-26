import sanitizeHtml from 'sanitize-html';
import type { IHtmlSanitizerService, SanitizeResult } from '../domain/html-sanitizer.service';

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'big', 'blockquote', 'body', 'br', 'caption', 'center', 'cite',
  'code', 'col', 'colgroup', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'html', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'meta', 'ol', 'p', 'pre', 'q', 's', 'samp',
  'small', 'span', 'strong', 'style', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'title', 'tr', 'u', 'ul', 'var',
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  // bgcolor/background/dir/role/nowrap are ubiquitous in exported email HTML
  // (Outlook, Mailchimp) and are presentation-only — safe without JS execution.
  '*': [
    'style', 'class', 'id', 'align', 'valign', 'width', 'height', 'border',
    'cellpadding', 'cellspacing', 'bgcolor', 'background', 'dir', 'role', 'nowrap',
  ],
  a: ['href', 'name', 'target', 'title', 'rel'],
  col: ['span'],
  colgroup: ['span'],
  font: ['color', 'face', 'size'],
  html: ['lang', 'xmlns'],
  img: ['src', 'alt', 'width', 'height', 'style', 'hspace', 'vspace'],
  meta: ['charset', 'name', 'content'],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

// sanitize-html only runs its scheme check (naughtyHref) against attributes named
// here; its default list is href/src/cite. `background` accepts a URL too, so
// without it a value like background="javascript:..." would slip past validation
// (GHSA-vccv-cmxp-4j9h / CVE-2026-53606, present up to sanitize-html 2.17.4).
// Listing every URL-bearing attribute we allow — plus the ones the advisory
// flags — keeps the gate in place regardless of the resolved library version.
const ALLOWED_SCHEMES_APPLIED_TO_ATTRIBUTES = [
  'href', 'src', 'cite', 'action', 'formaction', 'data', 'poster',
  'background', 'ping', 'xlink:href', 'dynsrc', 'lowsrc',
];

// Detects a javascript: scheme on one of the URL-bearing attributes above, used
// only to build a precise rejection message. Compiled once from a static list
// (no user input → no ReDoS). The `(?<![\w-])` lookbehind requires a real
// attribute boundary so `data-href="javascript:…"` is reported as the disallowed
// attribute `data-href`, not as a javascript: scheme.
const JAVASCRIPT_SCHEME_RE = new RegExp(
  `(?<![\\w-])(?:${ALLOWED_SCHEMES_APPLIED_TO_ATTRIBUTES.join('|')})\\s*=\\s*["']?\\s*javascript:`,
  'i',
);

function buildOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesAppliedToAttributes: ALLOWED_SCHEMES_APPLIED_TO_ATTRIBUTES,
    // Images must be served over https; links may still be http/mailto
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // <style> is on the allowlist so operators can paste complete email documents.
    // Emails never execute JavaScript, so the residual risk of a style block is
    // CSS-only; sanitize-html still refuses to enable it without this flag.
    allowVulnerableTags: true,
  };
}

/**
 * Normalizes void-tag serialization so that `<img ...>` and `<img ... />`
 * compare equal — sanitize-html always re-emits self-closing syntax.
 */
function normalizeSelfClosing(html: string): string {
  return html.replace(/\s*\/>/g, '>');
}

/**
 * At save time the body still carries Handlebars tokens (e.g.
 * `<img src="{{properfyLogoUrl}}">`), which are not URLs yet and would fail the
 * https scheme check. Masking every `{{...}}` token with a neutral https value
 * lets scheme validation run against the *rendered* shape of the template.
 * This does not weaken the pipeline: sanitizeForRender runs again on the fully
 * rendered HTML at send time and remains the authoritative gate.
 */
function maskTemplateTokens(html: string): string {
  return html.replace(/\{\{[^}]*\}\}/g, 'https://template-token.invalid');
}

/**
 * sanitize-html always drops doctype declarations and HTML comments, and trims
 * the trailing semicolon of style attributes, with no option to keep them.
 * All three are harmless in email bodies, so the save-time diff must ignore
 * them on both sides or pasting a complete email document would always be
 * rejected.
 */
function normalizeForComparison(html: string): string {
  return normalizeSelfClosing(
    html
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(style\s*=\s*")([^"]*?);\s*"/gi, '$1$2"')
      // sanitize-html re-encodes bare "&" as "&amp;" (e.g. in query strings);
      // both spellings are equivalent, so compare them as one.
      .replace(/&amp;/gi, '&'),
  ).trim();
}

/** First tag name in the document that is not on the allowlist, if any. */
function findDisallowedTag(html: string): string | null {
  // Hyphens are part of the name grammar (<custom-element>), so the reason
  // reports the full name rather than truncating at the first hyphen.
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    if (tag && !ALLOWED_TAGS.includes(tag)) return tag;
  }
  return null;
}

/**
 * First `name=` attribute not allowed for its tag, if any. Only used to build a
 * precise rejection message — safety itself still comes from the sanitize diff.
 */
function findDisallowedAttribute(html: string): string | null {
  const universal = ALLOWED_ATTRS['*'] ?? [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tag = (tagMatch[1] ?? '').toLowerCase();
    const perTag = ALLOWED_ATTRS[tag] ?? [];
    const allowed = new Set([...universal, ...perTag].map((a) => a.toLowerCase()));
    // Blank out quoted values so text like href="a=b" is never read as an
    // attribute, then tokenize what remains: `name="…"`, `name=`, or a bare
    // minimized attribute (`nowrap`, `contenteditable`).
    const attrChunk = (tagMatch[2] ?? '').replace(/"[^"]*"|'[^']*'/g, '""');
    const attrRe = /([a-zA-Z][\w-]*)(?:\s*=\s*(?:""|[^\s>]*))?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(attrChunk)) !== null) {
      if (attrMatch[0] === '') break;
      const attr = (attrMatch[1] ?? '').toLowerCase();
      if (attr && !allowed.has(attr)) return attr;
    }
  }
  return null;
}

/**
 * Implements IHtmlSanitizerService using the sanitize-html library.
 *
 * save profile  — validates (reject-on-diff, no mutation)
 * render profile — sanitizes (strips unsafe constructs, keeps https <img>)
 */
export class SanitizeHtmlService implements IHtmlSanitizerService {
  validateForSave(html: string): SanitizeResult {
    const masked = maskTemplateTokens(html);
    const sanitized = sanitizeHtml(masked, buildOptions());

    if (normalizeForComparison(sanitized) === normalizeForComparison(masked)) {
      return { safe: true };
    }

    // Determine a human-readable reason by finding what was stripped
    const scriptMatch = /<script\b/i.exec(html);
    if (scriptMatch) {
      return { safe: false, rejectedReason: 'Disallowed tag: <script>' };
    }
    const onMatch = /\bon\w+\s*=/i.exec(html);
    if (onMatch) {
      return { safe: false, rejectedReason: `Disallowed event handler: ${onMatch[0].trim()}` };
    }
    // A javascript: scheme on ANY URL-bearing attribute (not just href) earns
    // the specific reason — otherwise background/poster/etc. would fall through
    // to the generic message even though the sanitize diff already rejected them.
    const jsMatch = JAVASCRIPT_SCHEME_RE.exec(html);
    if (jsMatch) {
      return { safe: false, rejectedReason: 'Disallowed URL scheme: javascript:' };
    }
    const httpImgMatch = /<img\b[^>]*\bsrc\s*=\s*["']?(?!https:)/i.exec(html);
    if (httpImgMatch) {
      return { safe: false, rejectedReason: 'Image src must use https.' };
    }
    const disallowedTag = findDisallowedTag(html);
    if (disallowedTag) {
      return { safe: false, rejectedReason: `Disallowed tag: <${disallowedTag}>` };
    }
    const disallowedAttr = findDisallowedAttribute(html);
    if (disallowedAttr) {
      return { safe: false, rejectedReason: `Disallowed attribute: ${disallowedAttr}` };
    }

    return {
      safe: false,
      rejectedReason: 'Body contains constructs that are not permitted in email HTML.',
    };
  }

  sanitizeForRender(html: string): string {
    return sanitizeHtml(html, buildOptions());
  }
}
