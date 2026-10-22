import { AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface ErrorPanelProps {
  message: string;
  onRetry: () => void;
  onSaveExit: () => void;
}

export function ErrorPanel({ message, onRetry, onSaveExit }: ErrorPanelProps) {
  return (
    <div className="flex flex-col items-center px-page-x py-16 text-center" data-testid="error-panel">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">Submission Failed</h2>
      <Alert tone="destructive" className="mt-4 text-left">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <span>{message}</span>
      </Alert>
      <div className="mt-6 flex w-full gap-3">
        <Button variant="outlined" block onClick={onSaveExit} data-testid="save-exit-button">
          Save & Exit
        </Button>
        <Button variant="primary" block onClick={onRetry} data-testid="retry-button">
          Retry
        </Button>
      </div>
    </div>
  );
}
