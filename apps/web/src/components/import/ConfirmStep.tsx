import { Button } from '@/components/ui/Button';

interface ConfirmStepProps {
  totalRows: number;
  errorCount: number;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function ConfirmStep({
  totalRows,
  errorCount,
  onConfirm,
  onBack,
  isSubmitting,
}: ConfirmStepProps) {
  const validRows = totalRows - errorCount;
  const hasErrors = errorCount > 0;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
        Import Summary
      </h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">
            {totalRows}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
            Total Rows
          </p>
        </div>

        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-success)]">
            {validRows}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
            Valid Rows
          </p>
        </div>

        <div
          className={`rounded-lg border p-4 text-center ${
            hasErrors
              ? 'border-red-200 bg-red-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              hasErrors
                ? 'text-[var(--color-error)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {errorCount}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
            Error Rows
          </p>
        </div>
      </div>

      {hasErrors && (
        <div className="rounded-md bg-red-50 p-3" role="alert">
          <p className="text-sm text-[var(--color-error)]">
            Rows with errors will be skipped during import. Fix the errors and
            re-upload to import all rows.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        <Button variant="outlined" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={hasErrors || isSubmitting}
          loading={isSubmitting}
        >
          Start Import
        </Button>
      </div>
    </div>
  );
}
