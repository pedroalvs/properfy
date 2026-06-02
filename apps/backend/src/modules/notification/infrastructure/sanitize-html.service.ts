import sanitizeHtml from 'sanitize-html';
import type { IHtmlSanitizerService, SanitizeResult } from '../domain/html-sanitizer.service';

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre',
  'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var',
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing'],
  a: ['href', 'name', 'target', 'title'],
  col: ['span'],
  colgroup: ['span'],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/** Build sanitize-html options for the SAVE profile (no <img> at all). */
function buildSaveOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: {},
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  };
}

/** Build sanitize-html options for the RENDER profile (permits asset-host <img>). */
function buildRenderOptions(assetHostOrigin?: string): sanitizeHtml.IOptions {
  const tags = [...ALLOWED_TAGS, 'img'];
  const attrs: sanitizeHtml.IOptions['allowedAttributes'] = {
    ...ALLOWED_ATTRS,
    img: ['src', 'alt', 'width', 'height', 'style'],
  };

  const filterFn: sanitizeHtml.IOptions['allowedIframeHostnames'] = undefined;

  return {
    allowedTags: tags,
    allowedAttributes: attrs,
    allowedSchemes: ALLOWED_SCHEMES,
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: assetHostOrigin
      ? (frame) => {
          if (frame.tag === 'img') {
            const src: string = (frame.attribs['src'] as string) ?? '';
            return !src.startsWith(assetHostOrigin);
          }
          return false;
        }
      : (frame) => frame.tag === 'img',
  };
}

/**
 * Implements IHtmlSanitizerService using the sanitize-html library.
 *
 * save profile  — validates (reject-on-diff, no mutation)
 * render profile — sanitizes (permits trusted-host <img>)
 */
export class SanitizeHtmlService implements IHtmlSanitizerService {
  validateForSave(html: string): SanitizeResult {
    // Explicit check: any <img> tag is forbidden at save time
    if (/<img\b/i.test(html)) {
      return {
        safe: false,
        rejectedReason:
          'Literal <img> tags are not allowed. Use {{image:key}} placeholders instead.',
      };
    }

    const sanitized = sanitizeHtml(html, buildSaveOptions());

    if (sanitized === html) {
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

    return {
      safe: false,
      rejectedReason: 'Body contains constructs that are not permitted in email HTML.',
    };
  }

  sanitizeForRender(html: string, assetHostOrigin?: string): string {
    return sanitizeHtml(html, buildRenderOptions(assetHostOrigin));
  }
}
