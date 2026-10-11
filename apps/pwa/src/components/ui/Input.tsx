import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@properfy/frontend-standards';

/**
 * Text input primitive, styled to the validated tokens. Sets a 44px min touch
 * target and a destructive border/ring when `aria-invalid` is set, so a field in
 * error reads the same everywhere. Compose with the Form kit or use standalone.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex min-h-touch w-full rounded-btn border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
