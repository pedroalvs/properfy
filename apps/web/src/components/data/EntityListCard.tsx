import type { ReactNode } from 'react';

interface EntityListCardProps {
  children: ReactNode;
  className?: string;
}

export function EntityListCard({ children, className = '' }: EntityListCardProps) {
  return (
    <div className={`rounded bg-card-bg ${className}`}>
      {children}
    </div>
  );
}
