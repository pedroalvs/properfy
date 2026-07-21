import type { AuthContext } from '@properfy/shared';
import { SAMPLE_DATA } from '@properfy/shared';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface RenderTemplatePreviewInput {
  subject?: string;
  bodyHtml: string;
  tenantId?: string;
  actor: AuthContext;
}

export interface RenderTemplatePreviewOutput {
  subjectRendered: string;
  htmlRendered: string;
}

// Legacy {{image:key}} placeholders from the removed image-library feature.
const LEGACY_IMAGE_PLACEHOLDER_REGEX = /\{\{image:[A-Za-z0-9_-]+\}\}/g;

/**
 * Renders a preview of an email template body using sample data.
 * Pipeline: strip legacy image placeholders → Handlebars render → sanitize (render profile).
 * Errors degrade gracefully: render errors show inline, never throw.
 */
export class RenderTemplatePreviewUseCase {
  constructor(
    private readonly templateRenderer: TemplateRendererService,
    private readonly htmlSanitizer: IHtmlSanitizerService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: RenderTemplatePreviewInput): Promise<RenderTemplatePreviewOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    const sampleVars: Record<string, string> = SAMPLE_DATA as Record<string, string>;

    try {
      const bodyHtml = input.bodyHtml.replace(LEGACY_IMAGE_PLACEHOLDER_REGEX, '');

      const htmlRenderedRaw = this.templateRenderer.render(bodyHtml, sampleVars);
      const htmlRendered = this.htmlSanitizer.sanitizeForRender(htmlRenderedRaw);

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
