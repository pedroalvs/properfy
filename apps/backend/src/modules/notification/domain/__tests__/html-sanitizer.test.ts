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

  it('should reject any literal <img> tag (even with trusted src)', async () => {
    const svc = await loadImpl();
    const html = '<img src="https://assets.example.com/logo.png" alt="logo">';
    const result = svc.validateForSave(html);
    expect(result.safe).toBe(false);
    expect(result.rejectedReason).toMatch(/img/i);
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
});

describe('HtmlSanitizerService — render profile (sanitizeForRender)', () => {
  it('should return sanitized HTML that strips script tags', async () => {
    const svc = await loadImpl();
    const html = '<p>Hello</p><script>evil()</script>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('<script');
    expect(result).toContain('Hello');
  });

  it('should permit asset-host <img> when assetHostOrigin matches src', async () => {
    const svc = await loadImpl();
    const origin = 'https://cdn.supabase.example.com';
    const html = `<img src="${origin}/email-assets/t/logo.png" alt="logo">`;
    const result = svc.sanitizeForRender(html, origin);
    expect(result).toContain('<img');
    expect(result).toContain(origin);
  });

  it('should strip non-asset-host <img> tags in render profile', async () => {
    const svc = await loadImpl();
    const origin = 'https://cdn.supabase.example.com';
    const html = '<img src="https://evil.com/tracker.png" alt="x">';
    const result = svc.sanitizeForRender(html, origin);
    expect(result).not.toContain('<img');
  });

  it('should strip on* attributes in render profile', async () => {
    const svc = await loadImpl();
    const html = '<a href="https://properfy.com" onclick="evil()">Click</a>';
    const result = svc.sanitizeForRender(html);
    expect(result).not.toContain('onclick');
    expect(result).toContain('href');
  });
});
