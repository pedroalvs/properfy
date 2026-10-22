import type { ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';

interface EntityListCardProps {
  children: ReactNode;
  className?: string;
}

export function EntityListCard({ children, className = '' }: EntityListCardProps) {
  return (
    <div className={cn('bg-card-bg', className)}>
      {children}
    </div>
  );
}
