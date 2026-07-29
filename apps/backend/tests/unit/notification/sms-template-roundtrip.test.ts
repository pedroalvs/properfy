import { describe, it, expect, vi } from 'vitest';
import { UpsertNotificationTemplateUseCase } from '../../../src/modules/notification/application/use-cases/upsert-notification-template.use-case';
import { renderEmailBody } from '../../../src/modules/notification/application/render-email-body';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import { HtmlToTextService } from '../../../src/modules/notification/infrastructure/html-to-text.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

/**
 * End-to-end regression for the SMS body pipeline: what an operator types into
 * the template editor must be exactly what the recipient receives.
 *
 * The original bug lived in the seam between two use cases. The upsert wrote the
 * typed text into body_html as well as body_text; the send path then saw a
 * non-empty body_html and derived the SMS from it via sanitize → html-to-text,
 * word-wrapping at 120 chars and expanding hrefs. Each use case was internally
 * consistent and unit-tested, so only a test that spans the seam catches it.
 *
 * Two independent guards now prevent this — the upsert stores body_html NULL for
 * SMS, and renderEmailBody refuses the HTML branch on a non-EMAIL channel. They
 * are deliberately redundant, so THIS test only goes red when BOTH regress
 * (verified by removing each in turn, then both). That is the property worth
 * pinning here: the delivered message is correct as long as either layer holds.
 * Each guard also has its own red-proven unit test — see
 * `upsert-notification-template.use-case.test.ts` ("SMS storage normalization")
 * and `render-email-body.test.ts` ("SMS channel").
 *
 * Uses the REAL renderer and html-to-text services — a mocked converter would
 * report success no matter which column the body was read from.
 */
describe('SMS template round-trip: editor input → delivered message', () => {
  // Over 120 chars and carrying a link: both of html-to-text's mangling
  // behaviours (wordwrap, href expansion) would fire on this input.
  const TYPED_BODY =
    'Properfy: Hi {{rentalTenantName}}, your inspection at {{propertyAddress}} is scheduled for {{scheduledDate}}. Please confirm at {{confirmationLink}}';

  const VARS = {
    rentalTenantName: 'Alice Brown',
    propertyAddress: '12 Wallaby Way, Sydney NSW 2000',
    scheduledDate: '14/08/2026',
    confirmationLink: 'https://portal.properfy.com.au/c/abc123',
  };

  const EXPECTED_MESSAGE =
    'Properfy: Hi Alice Brown, your inspection at 12 Wallaby Way, Sydney NSW 2000 is scheduled for 14/08/2026. Please confirm at https://portal.properfy.com.au/c/abc123';

  function makeUseCase() {
    const templateRepo: INotificationTemplateRepository = {
      findByTenantCodeChannel: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const useCase = new UpsertNotificationTemplateUseCase(
      templateRepo,
      new TemplateRendererService(),
      auditService,
      new AuthorizationService(auditService),
      undefined,
      new HtmlToTextService(),
    );
    return { useCase, templateRepo };
  }

  const actor: AuthContext = {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  it('delivers the typed SMS verbatim — no word wrap, no href expansion', async () => {
    const { useCase, templateRepo } = makeUseCase();
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE_SMS',
      channel: 'SMS',
      bodyHtml: TYPED_BODY,
      isActive: true,
      actor,
    });

    const saved = vi.mocked(templateRepo.upsert).mock.calls[0][0];

    const { renderedBodyText } = renderEmailBody(
      {
        channel: 'SMS',
        bodyHtmlSource: saved.bodyHtml ?? '',
        bodyTextSource: saved.bodyText,
        subject: saved.subject,
        variables: VARS,
      },
      { templateRenderer: new TemplateRendererService(), htmlToText: new HtmlToTextService() },
    );

    expect(renderedBodyText).toBe(EXPECTED_MESSAGE);
    expect(renderedBodyText).not.toContain('\n');
    expect(renderedBodyText).not.toContain('[https://');
  });

  it('proves the guard has teeth: the same text down the EMAIL path IS mangled', () => {
    // Documents precisely what the old storage model did to an SMS body, and
    // fails loudly if html-to-text ever stops mangling (at which point the
    // channel gate is no longer load-bearing and this suite should be revisited).
    const { renderedBodyText } = renderEmailBody(
      {
        channel: 'EMAIL',
        bodyHtmlSource: TYPED_BODY,
        bodyTextSource: TYPED_BODY,
        subject: null,
        variables: VARS,
      },
      { templateRenderer: new TemplateRendererService(), htmlToText: new HtmlToTextService() },
    );

    expect(renderedBodyText).not.toBe(EXPECTED_MESSAGE);
    expect(renderedBodyText).toContain('\n');
  });
});
