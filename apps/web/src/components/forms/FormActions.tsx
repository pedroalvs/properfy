import type { ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';

interface FormActionsProps {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function FormActions({ children, align = 'right', className = '' }: FormActionsProps) {
  const justifyClass = align === 'left' ? 'justify-start' : 'justify-end';

  return (
    <div
      className={cn('flex gap-2 border-t border-black/10 pt-4', justifyClass, className)}
    >
      {children}
    </div>
  );
}
