import { Link } from 'react-router-dom';

/**
 * W7 #404: a bounded `variant` replaces the free-form `colorClass`/
 * `iconColorClass` props that previously let raw hex leak into call sites. Each
 * variant maps to design-token Tailwind utilities (registered in
 * tailwind.config.ts), so arbitrary classes are now a compile error.
 */
export type StatCardVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'draft'
  | 'awaiting'
  | 'scheduled'
  | 'done'
  | 'rejected';

const VARIANT_CLASSES: Record<StatCardVariant, { border: string; icon: string }> = {
  primary: { border: 'border-l-primary', icon: 'text-primary' },
  secondary: { border: 'border-l-secondary', icon: 'text-secondary' },
  accent: { border: 'border-l-accent', icon: 'text-accent' },
  draft: { border: 'border-l-status-draft', icon: 'text-status-draft' },
  awaiting: { border: 'border-l-status-awaiting', icon: 'text-warning' },
  scheduled: { border: 'border-l-status-scheduled', icon: 'text-info' },
  done: { border: 'border-l-status-done', icon: 'text-success' },
  rejected: { border: 'border-l-status-rejected', icon: 'text-error' },
};

interface StatCardProps {
  icon: string;
  value: number;
  label: string;
  sublabel?: string;
  variant: StatCardVariant;
  href?: string;
}

export function StatCard({ icon, value, label, sublabel, variant, href }: StatCardProps) {
  const { border, icon: iconClass } = VARIANT_CLASSES[variant];
  const content = (
    <div
      className={`rounded bg-card-bg shadow-sm border-l-4 ${border} p-4 flex items-start gap-3 ${
        href ? 'cursor-pointer transition hover:shadow-md' : ''
      }`}
      data-testid="stat-card"
    >
      <i className={`mdi ${icon} text-2xl ${iconClass}`} aria-hidden="true" />
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        <div className="text-sm text-text-secondary">{label}</div>
        {sublabel && <div className="text-xs text-warning mt-0.5">{sublabel}</div>}
      </div>
    </div>
  );

  if (href) {
    return <Link to={href} className="no-underline">{content}</Link>;
  }

  return content;
}
