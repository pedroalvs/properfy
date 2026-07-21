import { useState } from 'react';

interface ProviderLogoProps {
  /** File name (without extension) under /images/integrations/. */
  logoKey: string;
  brandColor: string;
  /** Square size in pixels. */
  size?: number;
}

/**
 * Provider logo tile: white glyph on the brand color. When no logo file
 * exists for the provider, falls back to the neutral default placeholder.
 */
export function ProviderLogo({ logoKey, brandColor, size = 64 }: ProviderLogoProps) {
  const [missing, setMissing] = useState(false);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${
        missing ? 'border border-dashed border-text-muted bg-app-bg' : ''
      }`}
      style={{ width: size, height: size, backgroundColor: missing ? undefined : brandColor }}
      aria-hidden="true"
    >
      <img
        src={`/images/integrations/${missing ? 'default' : logoKey}.svg`}
        alt=""
        width={size * 0.5}
        height={size * 0.5}
        onError={() => setMissing(true)}
      />
    </span>
  );
}
