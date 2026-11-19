import { Navigation } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { buildNavigationUrl, type NavigationTarget } from '../lib/navigation-url';

interface NavigateButtonProps {
  target: NavigationTarget;
  className?: string;
}

/**
 * External link that opens Apple/Google Maps directions to the stop. A real
 * anchor (not a button) so the OS handles the map intent; `rel="noopener"` and
 * an explicit accessible name "Navigate to {address} (opens maps)".
 */
export function NavigateButton({ target, className }: NavigateButtonProps) {
  const href = buildNavigationUrl(target);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Navigate to ${target.address} (opens maps)`}
      className={cn(
        'inline-flex min-h-touch items-center justify-center gap-2 rounded-btn border border-primary bg-card px-4 text-sm font-semibold text-primary hover:bg-primary/10',
        className,
      )}
      data-testid="navigate-button"
    >
      <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Navigate</span>
    </a>
  );
}
