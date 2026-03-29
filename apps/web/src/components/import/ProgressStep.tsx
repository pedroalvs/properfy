interface ProgressStepProps {
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; field?: string; message: string }[];
}

export function ProgressStep({
  status,
  progress,
  successCount,
  errorCount,
  errors,
}: ProgressStepProps) {
  return (
    <div className="space-y-6">
      {/* Status indicator */}
      <div className="flex flex-col items-center gap-3">
        {status === 'PROCESSING' && (
          <>
            <div
              className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]"
              role="status"
              aria-label="Processing import"
            />
            <p className="text-sm font-semibold text-[var(--color-primary)]">
              Processing import...
            </p>
          </>
        )}
        {status === 'COMPLETED' && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <i
                className="mdi mdi-check-circle text-3xl text-[var(--color-success)]"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm font-semibold text-[var(--color-success)]">
              Import completed
            </p>
          </>
        )}
        {status === 'FAILED' && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <i
                className="mdi mdi-close-circle text-3xl text-[var(--color-error)]"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm font-semibold text-[var(--color-error)]">
              Import failed
            </p>
          </>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>Progress</span>
          <span data-testid="progress-percentage">{progress}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status === 'FAILED'
                ? 'bg-[var(--color-error)]'
                : status === 'COMPLETED'
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-primary)]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Results summary */}
      {(status === 'COMPLETED' || status === 'FAILED') && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-[var(--color-success)]">
              {successCount}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
              Imported Successfully
            </p>
          </div>
          <div
            className={`rounded-lg border p-4 text-center ${
              errorCount > 0
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <p
              className={`text-2xl font-bold ${
                errorCount > 0
                  ? 'text-[var(--color-error)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {errorCount}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
              Errors
            </p>
          </div>
        </div>
      )}

      {/* Error table */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-[var(--color-error)]">
            Import Errors ({errors.length})
          </h4>
          <div className="max-h-64 overflow-y-auto rounded-md border border-red-200 bg-red-50">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-red-200 bg-red-100">
                  <th className="px-3 py-2 font-bold text-[var(--color-text-secondary)]">
                    Row
                  </th>
                  <th className="px-3 py-2 font-bold text-[var(--color-text-secondary)]">
                    Field
                  </th>
                  <th className="px-3 py-2 font-bold text-[var(--color-text-secondary)]">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-red-100"
                    data-testid={`error-row-${idx}`}
                  >
                    <td className="px-3 py-2 font-semibold">{err.row}</td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {err.field ?? '-'}
                    </td>
                    <td className="px-3 py-2">{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
