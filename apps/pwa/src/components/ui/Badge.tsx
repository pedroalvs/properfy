import { forwardRef, type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from '@properfy/frontend-standards';

/**
 * Status pill, matching the validated design-system chips. `tone` selects a bg/fg token
 * pair (all WCAG-safe). Domain code maps a status/confirmation value to a tone; the
 * colours themselves live in the design tokens, never inline.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] h-[26px] text-[12.5px] font-bold',
  {
    variants: {
      tone: {
        green: 'bg-pill-green text-pill-green-foreground',
        amber: 'bg-pill-amber text-pill-amber-foreground',
        blue: 'bg-pill-blue text-pill-blue-foreground',
        red: 'bg-pill-red text-pill-red-foreground',
        gray: 'bg-pill-gray text-pill-gray-foreground',
      },
    },
    defaultVariants: { tone: 'gray' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone, className, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);

Badge.displayName = 'Badge';

export { badgeVariants };
