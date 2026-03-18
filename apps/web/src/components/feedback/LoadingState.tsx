interface LoadingStateProps {
  rows?: number;
  variant?: 'table' | 'card';
}

export function LoadingState({ rows = 5, variant = 'table' }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={`animate-shimmer bg-gradient-to-r from-shimmer-from via-shimmer-via to-shimmer-to bg-[length:200%_100%] rounded ${
              variant === 'table' ? 'h-10 w-full' : 'h-24 w-full'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
