import type { AuthContext } from '@properfy/shared';
import { SAMPLE_DATA } from '@properfy/shared';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface ImageBindingDraft {
  placeholderKey: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface RenderTemplatePreviewInput {
  subject?: string;
  bodyHtml: string;
  tenantId?: string;
  imageBindings?: ImageBindingDraft[];
  actor: AuthContext;
}

export interface RenderTemplatePreviewOutput {
  subjectRendered: string;
  htmlRendered: string;
}

const IMAGE_PLACEHOLDER_RE = /\{\{image:(?<key>[a-zA-Z0-9_-]{1,64})\}\}/g;

/**
 * Renders a preview of an email template body using sample data.
 * Pipeline: image-resolve → Handlebars render → sanitize (render profile).
 * Errors degrade gracefully: render errors show inline, never throw.
 */
export class RenderTemplatePreviewUseCase {
  constructor(
    private readonly templateRenderer: TemplateRendererService,
    private readonly htmlSanitizer: IHtmlSanitizerService,
    private readonly authorizationService: AuthorizationService,
    private readonly emailAssetRepo?: IEmailAssetRepository,
    private readonly assetPublicUrlBase?: string,
  ) {}

  /**
   * Resolves {{image:key}} placeholders to <img> tags using persisted bindings or draft overrides.
   * Unknown keys are replaced with a visible [image: key] marker.
   */
  private async resolveImagePlaceholders(
    html: string,
    tenantId: string | null,
    draftBindings?: ImageBindingDraft[],
  ): Promise<string> {
    const draftByKey = new Map(
      (draftBindings ?? []).map((b) => [b.placeholderKey, b]),
    );

    const replacements = new Map<string, string>();
    const matches = [...html.matchAll(IMAGE_PLACEHOLDER_RE)];

    for (const match of matches) {
      const key = match.groups?.['key'];
      if (!key || replacements.has(key)) continue;

      const draft = draftByKey.get(key);
      const asset = this.emailAssetRepo
        ? await this.emailAssetRepo.findByPlaceholderKey(tenantId, key)
        : null;

      if (!asset && !this.assetPublicUrlBase) {
        replacements.set(key, `[image: ${key}]`);
        continue;
      }

      const src = asset?.publicUrl ?? '';
      const alt = draft?.altText ?? asset?.placeholderKey ?? key;
      const width = draft?.width ?? asset?.width;
      const height = draft?.height ?? asset?.height;
      const dims = [
        width ? `width="${width}"` : '',
        height ? `height="${height}"` : '',
      ]
        .filter(Boolean)
        .join(' ');

      replacements.set(
        key,
        src
          ? `<img src="${src}" alt="${alt}" ${dims} style="max-width:100%">`
          : `[image: ${key}]`,
      );
    }

    return html.replace(IMAGE_PLACEHOLDER_RE, (_full, key: string) => {
      return replacements.get(key) ?? `[image: ${key}]`;
    });
  }

  async execute(input: RenderTemplatePreviewInput): Promise<RenderTemplatePreviewOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    const tenantId = input.tenantId ?? null;
    const sampleVars: Record<string, string> = SAMPLE_DATA as Record<string, string>;

    try {
      // Step 1: resolve image placeholders
      const htmlWithImages = await this.resolveImagePlaceholders(
        input.bodyHtml,
        tenantId,
        input.imageBindings,
      );

      // Step 2: render Handlebars variables with sample data
      const htmlRenderedRaw = this.templateRenderer.render(htmlWithImages, sampleVars);

      // Step 3: sanitize with render profile (defense-in-depth)
      const htmlRendered = this.htmlSanitizer.sanitizeForRender(
        htmlRenderedRaw,
        this.assetPublicUrlBase,
      );

      // Step 4: render subject
      const subjectRendered = input.subject
        ? this.templateRenderer.render(input.subject, sampleVars)
        : '';

      return { subjectRendered, htmlRendered };
    } catch (err: unknown) {
      // Degrade gracefully on render errors (FR-022/SC-020)
      const message = err instanceof Error ? err.message : 'Preview render error';
      return {
        subjectRendered: input.subject ?? '',
        htmlRendered: `<p style="color:red;font-family:monospace">[Preview error: ${message}]</p>`,
      };
    }
  }
}
