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

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing'],
  a: ['href', 'name', 'target', 'title'],
  col: ['span'],
  colgroup: ['span'],
  font: ['color', 'face', 'size'],
  html: ['lang', 'xmlns'],
  img: ['src', 'alt', 'width', 'height', 'style'],
  meta: ['charset', 'name', 'content'],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

function buildOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
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
 * `<img src="{{agencyLogoUrl}}">`), which are not URLs yet and would fail the
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
      .replace(/(style\s*=\s*")([^"]*?);\s*"/gi, '$1$2"'),
  ).trim();
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
    const jsMatch = /href\s*=\s*["']?javascript:/i.exec(html);
    if (jsMatch) {
      return { safe: false, rejectedReason: 'Disallowed URL scheme: javascript:' };
    }
    const httpImgMatch = /<img\b[^>]*\bsrc\s*=\s*["']?(?!https:)/i.exec(html);
    if (httpImgMatch) {
      return { safe: false, rejectedReason: 'Image src must use https.' };
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
