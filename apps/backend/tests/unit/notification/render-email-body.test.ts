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
    bodyHtmlSource: '<p>Hello {{name}}</p>',
    bodyTextSource: 'Hello {{name}}',
    subject: 'Hi {{name}}',
    variables: { name: 'Alice' },
  };

  it('should render Handlebars vars in subject, html and text', () => {
    const deps: RenderEmailBodyDeps = { templateRenderer: makeTemplateRenderer() };
    const result = renderEmailBody(baseInput, deps);

    expect(result.renderedSubject).toBe('Hi Alice');
    expect(result.renderedBodyHtml).toBe('<p>Hello Alice</p>');
    expect(result.renderedBodyText).toBe('Hello Alice');
  });

  it('should strip orphaned {{image:key}} placeholders from html and text', () => {
    const deps: RenderEmailBodyDeps = { templateRenderer: makeTemplateRenderer() };

    const result = renderEmailBody(
      {
        ...baseInput,
        bodyHtmlSource: '<p>{{image:logo}}Hello {{name}}</p>',
        bodyTextSource: '{{image:logo}}Hello {{name}}',
      },
      deps,
    );

    expect(result.renderedBodyHtml).toBe('<p>Hello Alice</p>');
    expect(result.renderedBodyText).toBe('Hello Alice');
  });

  it('should apply sanitizeForRender after Handlebars rendering', () => {
    const templateRenderer = makeTemplateRenderer();
    const htmlSanitizer = { validateForSave: vi.fn(), sanitizeForRender: vi.fn().mockReturnValue('<p>SANITIZED</p>') };

    const result = renderEmailBody(baseInput, { templateRenderer, htmlSanitizer });

    expect(htmlSanitizer.sanitizeForRender).toHaveBeenCalledWith('<p>Hello Alice</p>');
    expect(result.renderedBodyHtml).toBe('<p>SANITIZED</p>');
  });

  it('should derive renderedBodyText from html-to-text when htmlToText is provided', () => {
    const templateRenderer = makeTemplateRenderer();
    const htmlToText = { convert: vi.fn().mockReturnValue('PLAIN TEXT') };

    const result = renderEmailBody(baseInput, { templateRenderer, htmlToText });

    expect(htmlToText.convert).toHaveBeenCalledWith('<p>Hello Alice</p>');
    expect(result.renderedBodyText).toBe('PLAIN TEXT');
  });

  it('should fall back to Handlebars-rendered bodyText when htmlToText is not provided', () => {
    const templateRenderer = makeTemplateRenderer();

    const result = renderEmailBody(
      { ...baseInput, bodyHtmlSource: '' },
      { templateRenderer },
    );

    expect(result.renderedBodyText).toBe('Hello Alice');
  });
});
