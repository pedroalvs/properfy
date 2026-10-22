import type { HTMLAttributes } from 'react';
import { cn } from '@properfy/frontend-standards';

/**
 * Loading placeholder. Use several to shape a skeleton of the real content
 * (never a lone spinner — see the global-states rule). Tokenised surface.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
