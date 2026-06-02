import type { TemplateRendererService } from '../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../domain/html-to-text.service';
import type { IImagePlaceholderResolver } from '../domain/image-placeholder-resolver.service';
import type { IEmailAssetRepository } from '../domain/email-asset.repository';
import type { ITemplateImageBindingRepository } from '../domain/template-image-binding.repository';

export interface RenderEmailBodyDeps {
  templateRenderer: TemplateRendererService;
  htmlSanitizer?: IHtmlSanitizerService;
  htmlToText?: IHtmlToTextService;
  imagePlaceholderResolver?: IImagePlaceholderResolver;
  emailAssetRepo?: IEmailAssetRepository;
  templateImageBindingRepo?: ITemplateImageBindingRepository;
  emailAssetsPublicUrlBase?: string;
}

export interface RenderEmailBodyInput {
  templateId: string;
  bodyHtmlSource: string;
  bodyTextSource: string;
  subject: string | null;
  variables: Record<string, string>;
}

export interface RenderEmailBodyOutput {
  renderedSubject: string;
  renderedBodyHtml: string;
  renderedBodyText: string;
  /** Asset IDs that were resolved (for markEverSent). */
  resolvedAssetIds: string[];
}

/**
 * Shared render pipeline for email notifications (Feature 030).
 *
 * Order: image-resolve → Handlebars → sanitizeForRender → html-to-text.
 * Used by both SendNotificationUseCase and SendTestNotificationUseCase so
 * the test-send email is byte-identical to the real delivery.
 */
export async function renderEmailBody(
  input: RenderEmailBodyInput,
  deps: RenderEmailBodyDeps,
): Promise<RenderEmailBodyOutput> {
  const {
    templateRenderer, htmlSanitizer, htmlToText,
    imagePlaceholderResolver, emailAssetRepo, templateImageBindingRepo, emailAssetsPublicUrlBase,
  } = deps;

  let bodyHtmlSource = input.bodyHtmlSource;
  const resolvedAssetIds: string[] = [];

  // 1. Resolve {{image:key}} → <img> tags (before Handlebars)
  if (bodyHtmlSource && imagePlaceholderResolver && templateImageBindingRepo && emailAssetRepo) {
    const bindings = await templateImageBindingRepo.findByTemplate(input.templateId);
    const resolvedBindings = await Promise.all(
      bindings.map(async (b) => {
        const asset = await emailAssetRepo.findById(b.assetId);
        if (!asset || asset.status !== 'VERIFIED') return null;
        resolvedAssetIds.push(asset.id);
        return {
          placeholderKey: b.placeholderKey,
          src: asset.publicUrl,
          alt: b.altText ?? asset.placeholderKey,
          width: b.width ?? asset.width ?? undefined,
          height: b.height ?? asset.height ?? undefined,
        };
      }),
    );
    bodyHtmlSource = imagePlaceholderResolver.resolve(
      bodyHtmlSource,
      resolvedBindings.filter(Boolean) as Parameters<typeof imagePlaceholderResolver.resolve>[1],
    );
  }

  // 2. Render Handlebars variables
  const renderedSubject = input.subject ? templateRenderer.render(input.subject, input.variables) : '';
  let renderedBodyHtml = bodyHtmlSource ? templateRenderer.render(bodyHtmlSource, input.variables) : '';

  // 3. Sanitize for render (defense-in-depth, permits trusted-host <img>)
  if (renderedBodyHtml && htmlSanitizer) {
    renderedBodyHtml = htmlSanitizer.sanitizeForRender(renderedBodyHtml, emailAssetsPublicUrlBase);
  }

  // 4. Derive plain text from HTML
  let renderedBodyText: string;
  if (renderedBodyHtml && htmlToText) {
    renderedBodyText = htmlToText.convert(renderedBodyHtml);
  } else {
    renderedBodyText = templateRenderer.render(input.bodyTextSource, input.variables);
  }

  return { renderedSubject, renderedBodyHtml, renderedBodyText, resolvedAssetIds };
}
