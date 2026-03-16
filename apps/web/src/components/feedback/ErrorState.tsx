import { Button } from '@/components/ui/Button';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  detail?: string;
}

export function ErrorState({ message, onRetry, detail }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-12 text-center">
      <i className="mdi mdi-alert-circle text-[48px] text-error" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">{message}</p>
      {detail && (
        <p className="mt-1 text-sm text-text-secondary">{detail}</p>
      )}
      <div className="mt-4">
        <Button variant="outlined" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
