import { describe, it, expect } from 'vitest';
import type { IImagePlaceholderResolver } from '../image-placeholder-resolver.service';

async function loadImpl(): Promise<IImagePlaceholderResolver> {
  const mod = await import('../image-placeholder-resolver.service');
  return new mod.ImagePlaceholderResolver();
}

describe('ImagePlaceholderResolver', () => {
  it('should replace a single {{image:key}} with an <img> tag', async () => {
    const resolver = await loadImpl();
    const result = resolver.resolve(
      'Hello {{image:logo}}',
      [{ placeholderKey: 'logo', src: 'https://cdn.example.com/logo.png', alt: 'Logo', width: 200, height: 50 }],
    );
    expect(result).toContain('<img');
    expect(result).toContain('src="https://cdn.example.com/logo.png"');
    expect(result).toContain('alt="Logo"');
    expect(result).not.toContain('{{image:logo}}');
  });

  it('should replace multiple placeholders', async () => {
    const resolver = await loadImpl();
    const result = resolver.resolve(
      '{{image:logo}} and {{image:banner}}',
      [
        { placeholderKey: 'logo', src: 'https://cdn.example.com/logo.png', alt: 'Logo' },
        { placeholderKey: 'banner', src: 'https://cdn.example.com/banner.jpg', alt: 'Banner' },
      ],
    );
    expect(result).toContain('src="https://cdn.example.com/logo.png"');
    expect(result).toContain('src="https://cdn.example.com/banner.jpg"');
  });

  it('should leave unknown placeholders as [image: key] marker', async () => {
    const resolver = await loadImpl();
    const result = resolver.resolve('{{image:missing}}', []);
    expect(result).toContain('[image: missing]');
    expect(result).not.toContain('<img');
  });

  it('should not disturb Handlebars {{variable}} syntax', async () => {
    const resolver = await loadImpl();
    const result = resolver.resolve(
      'Dear {{rentalTenantName}}, see {{image:logo}}',
      [{ placeholderKey: 'logo', src: 'https://cdn.example.com/logo.png', alt: '' }],
    );
    expect(result).toContain('{{rentalTenantName}}');
    expect(result).not.toContain('{{image:logo}}');
  });

  it('should include width and height when provided', async () => {
    const resolver = await loadImpl();
    const result = resolver.resolve(
      '{{image:hero}}',
      [{ placeholderKey: 'hero', src: 'https://cdn.example.com/hero.jpg', alt: 'Hero', width: 600, height: 300 }],
    );
    expect(result).toContain('width="600"');
    expect(result).toContain('height="300"');
  });
});
