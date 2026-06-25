/**
 * Port for deriving a plain-text version of an HTML email body.
 * Images are replaced by their alt text; links are preserved as text.
 */
export interface IHtmlToTextService {
  /** Converts the given HTML string to a plain-text representation. */
  convert(html: string): string;
}
