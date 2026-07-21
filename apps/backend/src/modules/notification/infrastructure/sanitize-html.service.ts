import sanitizeHtml from 'sanitize-html';
import type { IHtmlSanitizerService, SanitizeResult } from '../domain/html-sanitizer.service';

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p',
  'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var',
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing'],
  a: ['href', 'name', 'target', 'title'],
  col: ['span'],
  colgroup: ['span'],
  img: ['src', 'alt', 'width', 'height', 'style'],
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
 * Implements IHtmlSanitizerService using the sanitize-html library.
 *
 * save profile  — validates (reject-on-diff, no mutation)
 * render profile — sanitizes (strips unsafe constructs, keeps https <img>)
 */
export class SanitizeHtmlService implements IHtmlSanitizerService {
  validateForSave(html: string): SanitizeResult {
    const sanitized = sanitizeHtml(html, buildOptions());

    if (normalizeSelfClosing(sanitized) === normalizeSelfClosing(html)) {
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
