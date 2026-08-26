import type { AuthContext } from '@properfy/shared';
import { SAMPLE_DATA } from '@properfy/shared';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { LEGACY_IMAGE_PLACEHOLDER_REGEX } from '../render-email-body';

export interface RenderTemplatePreviewInput {
  subject?: string;
  bodyHtml: string;
  tenantId?: string;
  actor: AuthContext;
}

export interface RenderTemplatePreviewOutput {
  subjectRendered: string;
  htmlRendered: string;
  /** Set when rendering failed; template syntax errors carry the parser message. */
  renderError?: string;
}

/**
 * Renders a preview of an email template body using sample data.
 * Pipeline: strip legacy image placeholders → Handlebars render → sanitize (render profile).
 * When a tenantId is given (agency override open in the editor) the agency's
 * real logo/name/phone replace the platform samples, so preview ≈ delivery.
 * Errors degrade gracefully: render errors show inline, never throw.
 */
export class RenderTemplatePreviewUseCase {
  constructor(
    private readonly templateRenderer: TemplateRendererService,
    private readonly htmlSanitizer: IHtmlSanitizerService,
    private readonly authorizationService: AuthorizationService,
    private readonly tenantRepo?: Pick<ITenantRepository, 'findById'>,
  ) {}

  async execute(input: RenderTemplatePreviewInput): Promise<RenderTemplatePreviewOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    const sampleVars: Record<string, string> = { ...(SAMPLE_DATA as Record<string, string>) };

    // CL_ADMIN is pinned to its own tenant; AM/OP preview the tenant they are editing.
    const tenantId = input.actor.role === 'CL_ADMIN' ? (input.actor.tenantId ?? undefined) : input.tenantId;
    if (tenantId && this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant) {
        sampleVars.agencyName = tenant.name;
        const settings = tenant.settingsJson;
        if (typeof settings.logoUrl === 'string' && settings.logoUrl) {
          sampleVars.agencyLogoUrl = settings.logoUrl;
        }
        if (typeof settings.contactPhone === 'string' && settings.contactPhone) {
          sampleVars.agencyPhone = settings.contactPhone;
        }
      }
    }

    try {
      const bodyHtml = input.bodyHtml.replace(LEGACY_IMAGE_PLACEHOLDER_REGEX, '');

      const htmlRenderedRaw = this.templateRenderer.render(bodyHtml, sampleVars);
      const htmlRendered = this.htmlSanitizer.sanitizeForRender(htmlRenderedRaw);

      const subjectRendered = input.subject
        ? this.templateRenderer.render(input.subject, sampleVars)
        : '';

      return { subjectRendered, htmlRendered };
    } catch (err: unknown) {
      // Degrade gracefully on render errors (FR-022/SC-020). Handlebars parse
      // errors are operator-caused and actionable, so their message is passed
      // through in renderError; anything else gets a generic message so
      // internal details never reach the client. The message is never
      // interpolated into the returned HTML.
      const isTemplateSyntaxError =
        err instanceof Error && ('lineNumber' in err || /Parse error|Expecting /.test(err.message));
      const renderError =
        isTemplateSyntaxError && err instanceof Error ? err.message : 'Preview could not be rendered.';
      return {
        subjectRendered: input.subject ?? '',
        htmlRendered:
          '<p style="color:red;font-family:monospace">[Preview error — see details above the preview]</p>',
        renderError,
      };
    }
  }
}
