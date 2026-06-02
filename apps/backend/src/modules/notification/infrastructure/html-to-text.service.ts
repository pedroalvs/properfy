import { convert } from 'html-to-text';
import type { IHtmlToTextService } from '../domain/html-to-text.service';

/** Converts HTML to plain text for email multipart/alternative. */
export class HtmlToTextService implements IHtmlToTextService {
  convert(html: string): string {
    return convert(html, {
      wordwrap: 120,
      selectors: [
        { selector: 'img', format: 'imgAlt' },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: false } },
        // Disable default uppercase formatting on headings — it corrupts Handlebars {{vars}}
        { selector: 'h1', options: { uppercase: false } },
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'h4', options: { uppercase: false } },
        { selector: 'h5', options: { uppercase: false } },
        { selector: 'h6', options: { uppercase: false } },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatters: {
        imgAlt: (elem: { attribs?: { alt?: string } }, _walk: unknown, builder: { addInline: (t: string) => void }) => {
          const alt = elem.attribs?.['alt'] ?? '';
          if (alt) builder.addInline(alt);
        },
      },
    });
  }
}
