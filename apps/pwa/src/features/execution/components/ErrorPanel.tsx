import { Button } from '@/components/ui/Button';

interface ErrorPanelProps {
  message: string;
  onRetry: () => void;
  onSaveExit: () => void;
}

export function ErrorPanel({ message, onRetry, onSaveExit }: ErrorPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center px-page-x py-16 text-center" data-testid="error-panel">
      <i className="mdi mdi-alert-circle text-[64px] text-error" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold text-secondary">Submission Failed</h2>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="outlined" onClick={onSaveExit} data-testid="save-exit-button">
          Save & Exit
        </Button>
        <Button variant="primary" onClick={onRetry} data-testid="retry-button">
          Retry
        </Button>
      </div>
    </div>
  );
}
