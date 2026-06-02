import { describe, it, expect, vi } from 'vitest';
import { renderEmailBody } from '../../../src/modules/notification/application/render-email-body';
import type { RenderEmailBodyDeps, RenderEmailBodyInput } from '../../../src/modules/notification/application/render-email-body';
import type { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';

function makeTemplateRenderer(): TemplateRendererService {
  return {
    render: vi.fn((tpl: string, vars: Record<string, string>) => {
      return tpl.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`);
    }),
    validateVariables: vi.fn(() => []),
    extractVariables: vi.fn(() => []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as TemplateRendererService;
}

describe('renderEmailBody', () => {
  const baseInput: RenderEmailBodyInput = {
    templateId: 'tpl-1',
    bodyHtmlSource: '<p>Hello {{name}}</p>',
    bodyTextSource: 'Hello {{name}}',
    subject: 'Hi {{name}}',
    variables: { name: 'Alice' },
  };

  it('should render Handlebars vars in subject, html and text', async () => {
    const deps: RenderEmailBodyDeps = { templateRenderer: makeTemplateRenderer() };
    const result = await renderEmailBody(baseInput, deps);

    expect(result.renderedSubject).toBe('Hi Alice');
    expect(result.renderedBodyHtml).toBe('<p>Hello Alice</p>');
    expect(result.renderedBodyText).toBe('Hello Alice');
  });

  it('should resolve {{image:key}} placeholders before Handlebars rendering', async () => {
    const templateRenderer = makeTemplateRenderer();
    const imagePlaceholderResolver = {
      resolve: vi.fn().mockReturnValue('<img src="https://cdn.example.com/logo.png" alt="Logo"> {{name}}'),
    };
    const templateImageBindingRepo = {
      findByTemplate: vi.fn().mockResolvedValue([
        { id: 'b1', templateId: 'tpl-1', assetId: 'asset-1', placeholderKey: 'logo', altText: 'Logo', width: null, height: null, createdAt: new Date() },
      ]),
      findByAsset: vi.fn(), upsert: vi.fn(), deleteByTemplateAndKey: vi.fn(), deleteAllByTemplate: vi.fn(),
    };
    const emailAssetRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'asset-1', tenantId: null, placeholderKey: 'logo',
        storageKey: 'email-assets/logo.png', publicUrl: 'https://cdn.example.com/logo.png',
        originalFilename: 'logo.png', contentType: 'image/png', sizeBytes: 1000,
        width: 200, height: 100, status: 'VERIFIED', everSent: false, uploadedByUserId: 'u1', createdAt: new Date(),
      }),
      create: vi.fn(), findByPlaceholderKey: vi.fn(), findAll: vi.fn(), updateStatus: vi.fn(), markEverSent: vi.fn(), hardDelete: vi.fn(),
    };

    const deps: RenderEmailBodyDeps = {
      templateRenderer,
      imagePlaceholderResolver,
      templateImageBindingRepo,
      emailAssetRepo,
    };

    const input: RenderEmailBodyInput = {
      ...baseInput,
      bodyHtmlSource: '{{image:logo}} {{name}}',
    };

    const result = await renderEmailBody(input, deps);

    expect(imagePlaceholderResolver.resolve).toHaveBeenCalled();
    expect(result.resolvedAssetIds).toContain('asset-1');
    expect(result.renderedBodyHtml).toContain('Alice');
    expect(result.renderedBodyHtml).toContain('https://cdn.example.com/logo.png');
  });

  it('should skip image placeholders with PENDING/FAILED assets', async () => {
    const templateRenderer = makeTemplateRenderer();
    const imagePlaceholderResolver = { resolve: vi.fn().mockReturnValue('{{image:logo}} {{name}}') };
    const templateImageBindingRepo = {
      findByTemplate: vi.fn().mockResolvedValue([
        { id: 'b1', templateId: 'tpl-1', assetId: 'asset-bad', placeholderKey: 'logo', altText: null, width: null, height: null, createdAt: new Date() },
      ]),
      findByAsset: vi.fn(), upsert: vi.fn(), deleteByTemplateAndKey: vi.fn(), deleteAllByTemplate: vi.fn(),
    };
    const emailAssetRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'asset-bad', status: 'PENDING', tenantId: null, placeholderKey: 'logo',
        storageKey: 'k', publicUrl: 'https://cdn.example.com/logo.png', originalFilename: 'logo.png',
        contentType: 'image/png', sizeBytes: 1000, width: null, height: null, everSent: false,
        uploadedByUserId: 'u1', createdAt: new Date(),
      }),
      create: vi.fn(), findByPlaceholderKey: vi.fn(), findAll: vi.fn(), updateStatus: vi.fn(), markEverSent: vi.fn(), hardDelete: vi.fn(),
    };

    const result = await renderEmailBody(
      { ...baseInput, bodyHtmlSource: '{{image:logo}} {{name}}' },
      { templateRenderer, imagePlaceholderResolver, templateImageBindingRepo, emailAssetRepo },
    );

    expect(result.resolvedAssetIds).toHaveLength(0);
  });

  it('should apply sanitizeForRender after Handlebars rendering', async () => {
    const templateRenderer = makeTemplateRenderer();
    const htmlSanitizer = { validateForSave: vi.fn(), sanitizeForRender: vi.fn().mockReturnValue('<p>SANITIZED</p>') };

    const result = await renderEmailBody(baseInput, { templateRenderer, htmlSanitizer });

    expect(htmlSanitizer.sanitizeForRender).toHaveBeenCalledWith('<p>Hello Alice</p>', undefined);
    expect(result.renderedBodyHtml).toBe('<p>SANITIZED</p>');
  });

  it('should derive renderedBodyText from html-to-text when htmlToText is provided', async () => {
    const templateRenderer = makeTemplateRenderer();
    const htmlToText = { convert: vi.fn().mockReturnValue('PLAIN TEXT') };

    const result = await renderEmailBody(baseInput, { templateRenderer, htmlToText });

    expect(htmlToText.convert).toHaveBeenCalledWith('<p>Hello Alice</p>');
    expect(result.renderedBodyText).toBe('PLAIN TEXT');
  });

  it('should fall back to Handlebars-rendered bodyText when htmlToText is not provided', async () => {
    const templateRenderer = makeTemplateRenderer();

    const result = await renderEmailBody(
      { ...baseInput, bodyHtmlSource: '' },
      { templateRenderer },
    );

    expect(result.renderedBodyText).toBe('Hello Alice');
  });
});
