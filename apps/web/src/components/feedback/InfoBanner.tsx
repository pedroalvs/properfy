import type { ReactNode } from 'react';

interface InfoBannerProps {
  children: ReactNode;
  className?: string;
  variant?: 'info' | 'warning' | 'error';
}

const VARIANTS = {
  info: { container: 'bg-info/10 text-info', icon: 'mdi-information text-info' },
  warning: { container: 'bg-warning/10 text-warning', icon: 'mdi-alert text-warning' },
  error: { container: 'bg-error/10 text-error', icon: 'mdi-alert-circle text-error' },
} as const;

export function InfoBanner({ children, className = '', variant = 'info' }: InfoBannerProps) {
  const styles = VARIANTS[variant];
  return (
    <div
      className={`flex items-start gap-3 rounded px-4 py-3 text-sm ${styles.container} ${className}`}
      // Errors interrupt; info and warnings are ambient.
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <i className={`mdi mt-0.5 text-lg ${styles.icon}`} />
      {/* A div, not a span: callers legitimately pass flow content (lists,
          paragraphs), which is invalid inside phrasing content. As a flex item
          it renders identically to the span it replaced. */}
      <div>{children}</div>
    </div>
  );
}
