import type { ReactNode } from 'react';

interface InfoBannerProps {
  children: ReactNode;
  className?: string;
}

export function InfoBanner({ children, className = '' }: InfoBannerProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded bg-info/10 px-4 py-3 text-sm text-info ${className}`}
      role="status"
    >
      <i className="mdi mdi-information mt-0.5 text-lg text-info" />
      <span>{children}</span>
    </div>
  );
}
