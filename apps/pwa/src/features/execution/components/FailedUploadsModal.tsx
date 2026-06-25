import { Button } from '@/components/ui/Button';

interface FailedUploadsModalProps {
  failedCount: number;
  onSkip: () => void;
  onRetry: () => void;
}

export function FailedUploadsModal({ failedCount, onSkip, onRetry }: FailedUploadsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      data-testid="failed-uploads-modal"
    >
      <div className="w-full max-w-sm rounded-xl bg-card-bg p-6 shadow-lg" role="alertdialog">
        <div className="flex flex-col items-center text-center">
          <i className="mdi mdi-image-broken-variant text-4xl text-warning" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-text-primary">Photos failed to upload</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {failedCount} {failedCount === 1 ? 'photo' : 'photos'} failed to upload. Proceed without{' '}
            {failedCount === 1 ? 'it' : 'them'}?
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onRetry}
            className="!w-full !min-h-touch"
            data-testid="retry-upload-button"
          >
            Retry Upload
          </Button>
          <Button
            variant="outlined"
            onClick={onSkip}
            className="!w-full !min-h-touch"
            data-testid="skip-photos-button"
          >
            Skip Photos
          </Button>
        </div>
      </div>
    </div>
  );
}
