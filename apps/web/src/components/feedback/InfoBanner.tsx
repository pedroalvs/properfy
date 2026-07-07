import type { ReactNode } from 'react';

interface InfoBannerProps {
  children: ReactNode;
  className?: string;
  variant?: 'info' | 'warning';
}

const VARIANTS = {
  info: { container: 'bg-info/10 text-info', icon: 'mdi-information text-info' },
  warning: { container: 'bg-warning/10 text-warning', icon: 'mdi-alert text-warning' },
} as const;

export function InfoBanner({ children, className = '', variant = 'info' }: InfoBannerProps) {
  const styles = VARIANTS[variant];
  return (
    <div
      className={`flex items-start gap-3 rounded px-4 py-3 text-sm ${styles.container} ${className}`}
      role="status"
    >
      <i className={`mdi mt-0.5 text-lg ${styles.icon}`} />
      <span>{children}</span>
    </div>
  );
}
