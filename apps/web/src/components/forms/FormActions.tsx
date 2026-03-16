import type { ReactNode } from 'react';

interface FormActionsProps {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function FormActions({ children, align = 'right', className = '' }: FormActionsProps) {
  const justifyClass = align === 'left' ? 'justify-start' : 'justify-end';

  return (
    <div
      className={`flex gap-2 border-t border-black/10 pt-4 ${justifyClass} ${className}`}
    >
      {children}
    </div>
  );
}
