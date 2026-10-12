import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, cva, type VariantProps } from '@properfy/frontend-standards';

/**
 * The one button. Variants map to the validated design-system look (Inter, royal-blue
 * primary, green/red actions). Composition is `cn()` + CVA — never hand-built className
 * strings. The historical variant names are preserved so all 24 call sites keep working.
 */
const buttonVariants = cva(
  // `.pf-btn`: 54px tall, 15.5px/700 label. Height lives on the text variants so the
  // circular icon/delete buttons keep their 44×44 target; `min-h-touch` is the shared
  // a11y floor that every variant inherits.
  'inline-flex items-center justify-center gap-2 rounded-btn px-[18px] text-[15.5px] font-bold ' +
    'min-h-touch touch-manipulation select-none transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'h-[54px] bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        secondary: 'h-[54px] border border-border bg-muted text-foreground hover:bg-muted/80',
        outlined: 'h-[54px] border border-primary bg-card text-primary hover:bg-primary/10',
        success: 'h-[54px] bg-success text-success-foreground hover:bg-success/90 active:bg-success/80',
        danger:
          'h-[54px] bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        delete: 'rounded-full px-0 min-w-touch bg-transparent text-destructive hover:bg-destructive/10',
        icon: 'rounded-full px-0 min-w-touch bg-transparent text-muted-foreground hover:bg-foreground/5',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, block, loading = false, disabled, children, className, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, block }), className)}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { buttonVariants };
