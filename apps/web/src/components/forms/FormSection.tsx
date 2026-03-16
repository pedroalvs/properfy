import type { ReactNode } from 'react';

interface FormSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  columns = 1,
  className = '',
}: FormSectionProps) {
  const gridClass =
    columns === 2 ? 'grid gap-4 grid-cols-1 md:grid-cols-2' : 'grid gap-4 grid-cols-1';

  return (
    <div className={className}>
      {title && (
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          {title}
        </h3>
      )}
      {description && <p className="mb-4 text-xs text-text-muted">{description}</p>}
      <div className={gridClass}>{children}</div>
    </div>
  );
}
