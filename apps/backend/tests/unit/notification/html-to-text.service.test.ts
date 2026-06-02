import { describe, it, expect } from 'vitest';
import type { IHtmlToTextService } from '../../../src/modules/notification/domain/html-to-text.service';

async function loadImpl(): Promise<IHtmlToTextService> {
  const mod = await import('../../../src/modules/notification/infrastructure/html-to-text.service');
  return new mod.HtmlToTextService();
}

describe('HtmlToTextService', () => {
  it('should convert simple HTML to plain text', async () => {
    const svc = await loadImpl();
    const result = svc.convert('<p>Hello World</p>');
    expect(result.trim()).toBe('Hello World');
  });

  it('should replace image tags with their alt text', async () => {
    const svc = await loadImpl();
    const result = svc.convert('<img src="https://cdn.example.com/logo.png" alt="Company Logo">');
    expect(result).toContain('Company Logo');
    expect(result).not.toContain('<img');
  });

  it('should preserve link text and include the URL', async () => {
    const svc = await loadImpl();
    const result = svc.convert('<a href="https://properfy.com">Visit Properfy</a>');
    expect(result).toContain('Visit Properfy');
    expect(result).toContain('properfy.com');
  });

  it('should strip block formatting and return plain text from table layout', async () => {
    const svc = await loadImpl();
    const html = '<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>';
    const result = svc.convert(html);
    expect(result).toContain('Cell 1');
    expect(result).toContain('Cell 2');
    expect(result).not.toContain('<table');
  });

  it('should handle empty string', async () => {
    const svc = await loadImpl();
    const result = svc.convert('');
    expect(result.trim()).toBe('');
  });

  it('should NOT uppercase heading text (preserves Handlebars {{vars}})', async () => {
    const svc = await loadImpl();
    const result = svc.convert('<h1>{{tenantName}}</h1>');
    // html-to-text default uppercases headings — this breaks Handlebars (case-sensitive)
    expect(result).not.toContain('{{TENANTNAME}}');
    expect(result).toContain('{{tenantName}}');
  });

  it('should not uppercase plain heading text', async () => {
    const svc = await loadImpl();
    const result = svc.convert('<h2>Welcome to Properfy</h2>');
    expect(result).not.toContain('WELCOME TO PROPERFY');
    expect(result).toContain('Welcome to Properfy');
  });
});
