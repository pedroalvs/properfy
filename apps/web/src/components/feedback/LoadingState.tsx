interface LoadingStateProps {
  rows?: number;
  variant?: 'table' | 'card';
}

export function LoadingState({ rows = 5, variant = 'table' }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Carregando...</span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={`animate-shimmer bg-gradient-to-r from-[#F5F5F5] via-[#E0E0E0] to-[#F5F5F5] bg-[length:200%_100%] rounded ${
              variant === 'table' ? 'h-10 w-full' : 'h-24 w-full'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
