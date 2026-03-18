interface PreviewError {
  row: number;
  column: string;
  message: string;
}

interface PreviewStepProps {
  columns: string[];
  rows: Record<string, string>[];
  errors: PreviewError[];
  totalRows: number;
}

export function PreviewStep({ columns, rows, errors, totalRows }: PreviewStepProps) {
  const errorRowNumbers = new Set(errors.map((e) => e.row));
  const validRows = totalRows - errors.length;
  const previewRows = rows.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {totalRows} rows parsed
        </span>
        {errors.length > 0 ? (
          <span className="font-semibold text-[var(--color-error)]">
            {errors.length} errors found
          </span>
        ) : (
          <span className="font-semibold text-[var(--color-success)]">
            No errors found
          </span>
        )}
        <span className="text-[var(--color-text-muted)]">
          Showing first {Math.min(previewRows.length, 10)} rows
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)]">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => {
              const rowNumber = index + 1;
              const hasError = errorRowNumbers.has(rowNumber);

              return (
                <tr
                  key={rowNumber}
                  data-testid={`preview-row-${rowNumber}`}
                  className={`border-t border-gray-100 ${
                    hasError ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    {rowNumber}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2 text-xs text-[var(--color-text-primary)]"
                    >
                      {row[col] ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Error details */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-[var(--color-error)]">
            Error Details
          </h4>
          <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3">
            <ul className="space-y-1">
              {errors.map((err, idx) => (
                <li key={idx} className="text-xs text-[var(--color-text-primary)]">
                  <span className="font-semibold">
                    Row {err.row}, {err.column}:
                  </span>{' '}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Valid rows summary */}
      <div className="text-sm text-[var(--color-text-secondary)]">
        {validRows} valid rows ready for import
      </div>
    </div>
  );
}
