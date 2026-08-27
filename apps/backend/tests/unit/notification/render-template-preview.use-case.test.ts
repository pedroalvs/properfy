import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderTemplatePreviewUseCase } from '../../../src/modules/notification/application/use-cases/render-template-preview.use-case';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../../src/modules/notification/domain/html-sanitizer.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PROPERFY_LOGO_URL } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('RenderTemplatePreviewUseCase', () => {
  let htmlSanitizer: IHtmlSanitizerService;
  let tenantRepo: { findById: ReturnType<typeof vi.fn> };
  let useCase: RenderTemplatePreviewUseCase;

  beforeEach(() => {
    htmlSanitizer = {
      validateForSave: vi.fn().mockReturnValue({ safe: true }),
      sanitizeForRender: vi.fn((html: string) => html),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        name: 'Acme Realty',
        settingsJson: { logoUrl: 'https://cdn.example.com/acme.png', contactPhone: '+61298765432' },
      }),
    };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new RenderTemplatePreviewUseCase(
      new TemplateRendererService(),
      htmlSanitizer,
      new AuthorizationService(auditService),
      tenantRepo,
    );
  });

  it('rejects INSP', async () => {
    await expect(
      useCase.execute({ bodyHtml: '<p>x</p>', actor: makeActor({ role: 'INSP' }) }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('renders body and subject with sample data', async () => {
    const result = await useCase.execute({
      subject: 'Inspection at {{propertyAddress}}',
      bodyHtml: '<p>Hello {{rentalTenantName}}</p>',
      actor: makeActor(),
    });
    expect(result.subjectRendered).toContain('Inspection at ');
    expect(result.subjectRendered).not.toContain('{{');
    expect(result.htmlRendered).not.toContain('{{');
    expect(result.renderError).toBeUndefined();
  });

  it('without tenantId, agencyLogoUrl renders empty — never the Properfy logo', async () => {
    const result = await useCase.execute({
      bodyHtml: '<img src="{{agencyLogoUrl}}">',
      actor: makeActor(),
    });
    expect(result.htmlRendered).not.toContain(PROPERFY_LOGO_URL);
    expect(tenantRepo.findById).not.toHaveBeenCalled();
  });

  it('with tenantId, renders the agency logo, name and phone from tenant settings', async () => {
    const result = await useCase.execute({
      bodyHtml: '<img src="{{agencyLogoUrl}}"><p>{{agencyName}} {{agencyPhone}}</p>',
      tenantId: 'tenant-1',
      actor: makeActor(),
    });
    expect(tenantRepo.findById).toHaveBeenCalledWith('tenant-1');
    expect(result.htmlRendered).toContain('https://cdn.example.com/acme.png');
    expect(result.htmlRendered).toContain('Acme Realty');
    expect(result.htmlRendered).toContain('+61298765432');
  });

  it('with tenantId but no tenant logo, renders empty — no Properfy fallback', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-1', name: 'Acme', settingsJson: {} });
    const result = await useCase.execute({
      bodyHtml: '<img src="{{agencyLogoUrl}}">',
      tenantId: 'tenant-1',
      actor: makeActor(),
    });
    expect(result.htmlRendered).not.toContain(PROPERFY_LOGO_URL);
  });

  it('CL_ADMIN previews with its own tenant scope regardless of input tenantId', async () => {
    await useCase.execute({
      bodyHtml: '<p>x</p>',
      tenantId: 'tenant-other',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-own' }),
    });
    expect(tenantRepo.findById).toHaveBeenCalledWith('tenant-own');
  });

  it('a Handlebars syntax error surfaces in renderError with the parser message', async () => {
    const result = await useCase.execute({
      bodyHtml: '<p>{{#if}</p>',
      actor: makeActor(),
    });
    expect(result.renderError).toBeTruthy();
    expect(result.htmlRendered).toContain('Preview error');
    // The parser message must NOT be interpolated into the returned HTML.
    expect(result.htmlRendered).not.toContain(result.renderError as string);
  });

  it('an internal error returns a generic renderError, not the raw message', async () => {
    vi.mocked(htmlSanitizer.sanitizeForRender).mockImplementation(() => {
      throw new Error('ECONNREFUSED db.internal:5432');
    });
    const result = await useCase.execute({ bodyHtml: '<p>x</p>', actor: makeActor() });
    expect(result.renderError).toBeTruthy();
    expect(result.renderError).not.toContain('ECONNREFUSED');
    expect(result.htmlRendered).not.toContain('ECONNREFUSED');
  });
});
