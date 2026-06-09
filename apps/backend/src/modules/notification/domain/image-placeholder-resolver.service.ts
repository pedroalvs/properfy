export interface ResolvedImageBinding {
  placeholderKey: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface IImagePlaceholderResolver {
  /**
   * Replaces {{image:key}} placeholders in the body with real <img> tags.
   * Unknown keys are replaced with a [image: key] text marker.
   * Does NOT touch Handlebars {{variable}} syntax.
   */
  resolve(body: string, bindings: ResolvedImageBinding[]): string;
}

const IMAGE_PLACEHOLDER_RE = /\{\{image:(?<key>[a-zA-Z0-9_-]{1,64})\}\}/g;

/** Distinct from the Handlebars engine — resolves image placeholders only. */
export class ImagePlaceholderResolver implements IImagePlaceholderResolver {
  resolve(body: string, bindings: ResolvedImageBinding[]): string {
    const byKey = new Map(bindings.map((b) => [b.placeholderKey, b]));

    return body.replace(IMAGE_PLACEHOLDER_RE, (_full, key: string) => {
      const binding = byKey.get(key);
      if (!binding) return `[image: ${key}]`;

      const dims = [
        binding.width != null ? `width="${binding.width}"` : '',
        binding.height != null ? `height="${binding.height}"` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const dimStr = dims ? ` ${dims}` : '';
      return `<img src="${binding.src}" alt="${binding.alt}"${dimStr} style="max-width:100%">`;
    });
  }
}
