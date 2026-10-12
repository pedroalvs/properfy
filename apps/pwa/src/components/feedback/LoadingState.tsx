import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@properfy/frontend-standards';

interface LoadingStateProps {
  rows?: number;
  variant?: 'table' | 'card';
}

export function LoadingState({ rows = 5, variant = 'card' }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton
            key={i}
            className={cn('w-full', variant === 'table' ? 'h-10' : 'h-24')}
          />
        ))}
      </div>
    </div>
  );
}
