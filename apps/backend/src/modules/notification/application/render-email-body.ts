import type { TemplateRendererService } from '../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../domain/html-to-text.service';

export interface RenderEmailBodyDeps {
  templateRenderer: TemplateRendererService;
  htmlSanitizer?: IHtmlSanitizerService;
  htmlToText?: IHtmlToTextService;
}

export interface RenderEmailBodyInput {
  bodyHtmlSource: string;
  bodyTextSource: string;
  subject: string | null;
  variables: Record<string, string>;
}

export interface RenderEmailBodyOutput {
  renderedSubject: string;
  renderedBodyHtml: string;
  renderedBodyText: string;
}

// Legacy {{image:key}} placeholders from the removed image-library feature.
// Stripped before Handlebars so orphaned tokens neither break parsing nor leak into emails.
const LEGACY_IMAGE_PLACEHOLDER_REGEX = /\{\{image:[A-Za-z0-9_-]+\}\}/g;

/**
 * Shared render pipeline for email notifications.
 *
 * Order: strip legacy image placeholders → Handlebars → sanitizeForRender → html-to-text.
 * Used by both SendNotificationUseCase and SendTestNotificationUseCase so
 * the test-send email is byte-identical to the real delivery.
 */
export function renderEmailBody(
  input: RenderEmailBodyInput,
  deps: RenderEmailBodyDeps,
): RenderEmailBodyOutput {
  const { templateRenderer, htmlSanitizer, htmlToText } = deps;

  const bodyHtmlSource = input.bodyHtmlSource.replace(LEGACY_IMAGE_PLACEHOLDER_REGEX, '');
  const bodyTextSource = input.bodyTextSource.replace(LEGACY_IMAGE_PLACEHOLDER_REGEX, '');

  const renderedSubject = input.subject ? templateRenderer.render(input.subject, input.variables) : '';
  let renderedBodyHtml = bodyHtmlSource ? templateRenderer.render(bodyHtmlSource, input.variables) : '';

  if (renderedBodyHtml && htmlSanitizer) {
    renderedBodyHtml = htmlSanitizer.sanitizeForRender(renderedBodyHtml);
  }

  let renderedBodyText: string;
  if (renderedBodyHtml && htmlToText) {
    renderedBodyText = htmlToText.convert(renderedBodyHtml);
  } else {
    renderedBodyText = templateRenderer.render(bodyTextSource, input.variables);
  }

  return { renderedSubject, renderedBodyHtml, renderedBodyText };
}
