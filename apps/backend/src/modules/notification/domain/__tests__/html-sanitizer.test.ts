import { describe, it, expect } from 'vitest';
import type { IHtmlSanitizerService } from '../html-sanitizer.service';

// RED: this import will fail until the implementation exists
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HtmlSanitizerServiceImpl: new () => IHtmlSanitizerService;

async function loadImpl(): Promise<IHtmlSanitizerService> {
  const mod = await import('../../infrastructure/sanitize-html.service');
  HtmlSanitizerServiceImpl = mod.SanitizeHtmlService;
  return new HtmlSanitizerServiceImpl();
}

describe('HtmlSanitizerService — save profile (validateForSave)', () => {
  it('should return safe=true for clean allowlist HTML', async () => {
    const svc = await loadImpl();
    const html = '<table><tr><td style="color:red"><strong>Hello</strong></td></tr></table>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should reject <script> tags', async () => {
    const svc = await loadImpl();
    const html = '<p>Hello</p><script>alert(1)</script>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toBeTruthy();
  });

  it('should reject on* event handler attributes', async () => {
    const svc = await loadImpl();
    const html = '<a href="http://x.com" onclick="evil()">Click</a>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
  });

  it('should reject javascript: URL in href', async () => {
    const svc = await loadImpl();
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
  });

  it('should permit <img> with https src', async () => {
    const svc = await loadImpl();
    const html = '<img src="https://assets.example.com/logo.png" alt="logo" width="120">';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit self-closing <img /> with https src', async () => {
    const svc = await loadImpl();
    const html = '<p>Hi</p><img src="https://assets.example.com/logo.png" alt="logo" />';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should reject <img> with http (non-https) src', async () => {
    const svc = await loadImpl();
    const html = '<img src="http://assets.example.com/logo.png" alt="logo">';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toMatch(/https/i);
  });

  it('should reject <img> with javascript: src', async () => {
    const svc = await loadImpl();
    const html = '<img src="javascript:alert(1)">';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
  });

  it('should permit http links', async () => {
    const svc = await loadImpl();
    const html = '<a href="https://properfy.com">Properfy</a>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit mailto links', async () => {
    const svc = await loadImpl();
    const html = '<a href="mailto:hello@properfy.com">Contact us</a>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit inline styles on layout tags', async () => {
    const svc = await loadImpl();
    const html = '<div style="font-family:sans-serif;color:#333">Hello</div>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit a full HTML document (html/head/body/title/meta)', async () => {
    const svc = await loadImpl();
    const html =
      '<html lang="en"><head><meta charset="utf-8"><title>Inspection</title></head>' +
      '<body style="margin:0;background-color:rgb(47,47,47)"><p>Hello</p></body></html>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should tolerate a leading doctype on save', async () => {
    const svc = await loadImpl();
    const html = '<!DOCTYPE html>\n<html><body><p>Hello</p></body></html>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should tolerate HTML comments on save', async () => {
    const svc = await loadImpl();
    const html = '<p>Hello</p><!-- outlook conditional leftovers -->';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit a <style> block', async () => {
    const svc = await loadImpl();
    const html = '<style>p { color: #fff; }</style><p>Hello</p>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit legacy <center> and <font> tags', async () => {
    const svc = await loadImpl();
    const html = '<center><font color="#ffffff" face="Arial" size="3">Hello</font></center>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should tolerate a trailing semicolon in style attributes on save', async () => {
    const svc = await loadImpl();
    const html = '<div style="margin:0;padding:0;">Hello</div>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit <img> whose src is a template variable (resolved at render time)', async () => {
    const svc = await loadImpl();
    const html = '{{#if properfyLogoUrl}}<img src="{{properfyLogoUrl}}" alt="{{agencyName}}">{{/if}}';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should still reject javascript: prefix even with a template variable appended', async () => {
    const svc = await loadImpl();
    const html = '<img src="javascript:{{properfyLogoUrl}}">';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
  });

  it('should still reject <script> inside a full document', async () => {
    const svc = await loadImpl();
    const html = '<html><head><script>evil()</script></head><body><p>Hi</p></body></html>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toMatch(/script/i);
  });

  it('should still reject <iframe> and <link> tags', async () => {
    const svc = await loadImpl();
    expect(svc.validateForSave('<iframe src="https://x.com"></iframe>').safe).toBe(false);
    expect(
      svc.validateForSave('<head><link rel="stylesheet" href="https://x.com/a.css"></head>').safe,
    ).toBe(false);
  });
});

describe('HtmlSanitizerService — render profile (sanitizeForRender)', () => {
  it('should return sanitized HTML that strips script tags', async () => {
    const svc = await loadImpl();
    const html = '<p>Hello</p><script>evil()</script>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('<script');
    expect(result).toContain('Hello');
  });

  it('should keep <img> with https src in render profile', async () => {
    const svc = await loadImpl();
    const html = '<img src="https://assets.example.com/logo.png" alt="logo">';
    const result = svc.sanitizeForRender(html);
    expect(result).toContain('<img');
    expect(result).toContain('https://assets.example.com/logo.png');
  });

  it('should strip src from <img> with non-https scheme in render profile', async () => {
    const svc = await loadImpl();
    const html = '<img src="javascript:alert(1)" alt="x">';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('javascript:');
  });

  it('should strip src from <img> with http scheme in render profile', async () => {
    const svc = await loadImpl();
    const html = '<img src="http://assets.example.com/logo.png" alt="x">';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('http://assets.example.com');
  });

  it('should strip src from <img> with protocol-relative URL in render profile', async () => {
    const svc = await loadImpl();
    const html = '<img src="//assets.example.com/logo.png" alt="x">';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('//assets.example.com');
  });

  it('should keep a full document structure and <style> block in render profile', async () => {
    const svc = await loadImpl();
    const html =
      '<html><head><style>p{color:#fff}</style></head><body><p>Hello</p></body></html>';
    const result = svc.sanitizeForRender(html);
    expect(result).toContain('<style>');
    expect(result).toContain('<body>');
    expect(result).toContain('Hello');
  });

  it('should strip on* attributes in render profile', async () => {
    const svc = await loadImpl();
    const html = '<a href="https://properfy.com" onclick="evil()">Click</a>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('onclick');
    expect(result).toContain('href');
  });
});
