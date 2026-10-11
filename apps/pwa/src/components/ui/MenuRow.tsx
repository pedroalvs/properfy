import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';

/** Rounded card that groups MenuRows, hairline-divided like the validated list rows. */
export function MenuList({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('divide-y divide-border overflow-hidden rounded-card border border-border bg-card shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface MenuRowProps {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  /** Render as a router link when set. */
  to?: string;
  /** Render as a button when set (ignored if `to` is set). */
  onClick?: () => void;
  /** Replaces the trailing chevron (e.g. a status chip). */
  trailing?: ReactNode;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

/**
 * A single navigation row (the validated `pf-row`): a muted icon tile, a bold
 * label with an optional sub, and a trailing chevron. Renders as a router Link
 * (`to`) or a button (`onClick`); always a 44px+ touch target.
 */
export function MenuRow({
  icon,
  label,
  sublabel,
  to,
  onClick,
  trailing,
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: MenuRowProps) {
  const inner = (
    <>
      <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold text-foreground">{label}</span>
        {sublabel && <span className="truncate text-xs text-muted-foreground">{sublabel}</span>}
      </span>
      {trailing ?? <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );

  const classes = cn(
    'flex min-h-touch w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    className,
  );

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel ?? label} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-label={ariaLabel ?? label} data-testid={testId}>
      {inner}
    </button>
  );
}
