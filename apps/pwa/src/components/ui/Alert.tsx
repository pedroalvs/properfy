import { forwardRef, type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from '@properfy/frontend-standards';

/**
 * Inline status/notice banner, matching the validated design-system tones.
 * `tone` picks a tinted surface + readable foreground from the design tokens.
 */
const alertVariants = cva(
  'relative flex items-start gap-3 rounded-card border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        info: 'border-border bg-card text-foreground [&>svg]:text-primary',
        success: 'border-pill-green bg-pill-green text-pill-green-foreground',
        warning: 'border-pill-amber bg-pill-amber text-pill-amber-foreground',
        destructive: 'border-pill-red bg-pill-red text-pill-red-foreground',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ tone, className, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ tone }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export const AlertTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-bold', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-[13px] opacity-90', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { alertVariants };
