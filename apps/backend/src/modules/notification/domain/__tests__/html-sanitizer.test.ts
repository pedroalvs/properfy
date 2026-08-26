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
    const html = '<a href="https://properfy.me">Properfy</a>';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(true);
  });

  it('should permit mailto links', async () => {
    const svc = await loadImpl();
    const html = '<a href="mailto:hello@properfy.me">Contact us</a>';
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

  it('should permit common exported-email attributes (bgcolor, background, role, dir, nowrap)', async () => {
    const svc = await loadImpl();
    const html =
      '<table role="presentation" bgcolor="#ffffff" background="https://x.com/bg.png" dir="ltr">' +
      '<tr><td nowrap="nowrap" bgcolor="#eeeeee">Hi</td></tr></table>';
    expect(svc.validateForSave(html).safe).toBe(true);
  });

  it('should reject a javascript: URL in the background attribute', async () => {
    const svc = await loadImpl();
    // Regression for GHSA-vccv-cmxp-4j9h: `background` is a URL-bearing
    // attribute and must be scheme-checked just like href/src.
    const result = svc.validateForSave('<td background="javascript:alert(1)">x</td>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toMatch(/javascript:/i);
  });

  it('should report data-href as a disallowed attribute, not a javascript: scheme', async () => {
    const svc = await loadImpl();
    // The scheme check must key on a real attribute boundary: `data-href` is not
    // an allowed URL attribute, so it is rejected as an attribute, not a scheme.
    const result = svc.validateForSave('<p data-href="javascript:alert(1)">x</p>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toBe('Disallowed attribute: data-href');
  });

  it('should permit rel on links and hspace/vspace on images', async () => {
    const svc = await loadImpl();
    const html =
      '<a href="https://x.com" rel="noopener" target="_blank">x</a>' +
      '<img src="https://x.com/a.png" hspace="4" vspace="4">';
    expect(svc.validateForSave(html).safe).toBe(true);
  });

  it('should name the offending tag in the rejection reason', async () => {
    const svc = await loadImpl();
    const result = svc.validateForSave('<p>ok</p><iframe src="https://x.com"></iframe>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toContain('<iframe>');
  });

  it('should name the offending attribute in the rejection reason', async () => {
    const svc = await loadImpl();
    const result = svc.validateForSave('<p contenteditable="true">x</p>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toContain('contenteditable');
  });

  it('should report the full name of a hyphenated disallowed tag', async () => {
    const svc = await loadImpl();
    const result = svc.validateForSave('<custom-element>x</custom-element>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toContain('<custom-element>');
  });

  it('should name a valueless disallowed attribute in the rejection reason', async () => {
    const svc = await loadImpl();
    const result = svc.validateForSave('<p contenteditable>x</p>');
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toContain('contenteditable');
  });

  it('should not misreport valueless ALLOWED attributes (nowrap)', async () => {
    const svc = await loadImpl();
    // nowrap without a value is legal minimized-attribute HTML and allowed.
    expect(svc.validateForSave('<table><tr><td nowrap>Hi</td></tr></table>').safe).toBe(true);
  });

  it('should not misreport attribute-like text inside quoted values', async () => {
    const svc = await loadImpl();
    // href value contains "foo=bar" — must not be reported as attribute "foo"
    const result = svc.validateForSave('<a href="https://x.com/?foo=bar&baz=1">link</a>');
    expect(result.safe).toBe(true);
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

  it('should strip a javascript: background attribute in render profile', async () => {
    const svc = await loadImpl();
    const html = '<td background="javascript:alert(1)">x</td>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('javascript:');
  });

  it('should strip on* attributes in render profile', async () => {
    const svc = await loadImpl();
    const html = '<a href="https://properfy.me" onclick="evil()">Click</a>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('onclick');
    expect(result).toContain('href');
  });
});
