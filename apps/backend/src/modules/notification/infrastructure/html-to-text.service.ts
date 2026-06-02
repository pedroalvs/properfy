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
