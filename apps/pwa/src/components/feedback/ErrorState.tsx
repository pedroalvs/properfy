import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  detail?: string;
  /** Retry button label; defaults to "Try Again". */
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, detail, retryLabel = 'Try Again' }: ErrorStateProps) {
  return (
    <div className="px-page-x py-12">
      <Alert tone="destructive" className="flex-col items-center text-center">
        <AlertCircle className="h-12 w-12" aria-hidden="true" />
        <AlertTitle className="mt-4 text-base">{message}</AlertTitle>
        {detail && <AlertDescription className="mt-1">{detail}</AlertDescription>}
        <div className="mt-4">
          <Button variant="outlined" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      </Alert>
    </div>
  );
}
