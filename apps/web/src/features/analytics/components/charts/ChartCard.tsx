import { useId, useState, type ReactNode } from 'react';

export interface ChartTableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Numeric columns align right so magnitudes line up on the decimal. */
  numeric?: boolean;
}

interface ChartCardProps<T> {
  title: string;
  /** Short line under the title — units, period, or what the series counts. */
  caption?: string;
  children: ReactNode;
  /** Rows behind the chart. Required: the table view is not optional. */
  tableRows: T[];
  tableColumns: ChartTableColumn<T>[];
  /** Shown instead of the chart when there is nothing to plot. */
  emptyMessage?: string;
  className?: string;
}

/**
 * Card shell shared by every chart on the screen.
 *
 * The Table toggle is a requirement, not a convenience. The validated
 * categorical palette leaves three hues below 3:1 contrast on this white
 * surface, and the relief rule for that warning is direct labels *plus* a
 * table view. It also serves the case colour cannot: screen readers, printing,
 * and forced-colors mode.
 */
export function ChartCard<T>({
  title,
  caption,
  children,
  tableRows,
  tableColumns,
  emptyMessage = 'No data for this period.',
  className = '',
}: ChartCardProps<T>) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();
  const isEmpty = tableRows.length === 0;

  return (
    <div className={`rounded bg-card-bg p-4 shadow-sm ${className}`} data-testid="chart-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-secondary">{title}</h2>
          {caption && <p className="mt-0.5 text-xs text-text-muted">{caption}</p>}
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setShowTable((current) => !current)}
            aria-expanded={showTable}
            aria-controls={panelId}
            className="shrink-0 rounded border border-black/10 px-2 py-1 text-xs font-bold text-text-secondary transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <i className={`mdi ${showTable ? 'mdi-chart-line' : 'mdi-table'} mr-1`} aria-hidden="true" />
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      <div id={panelId}>
        {isEmpty ? (
          <p className="py-8 text-center text-sm text-text-muted">{emptyMessage}</p>
        ) : showTable ? (
          // Wide tables scroll inside the card rather than pushing the page sideways.
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10">
                  {tableColumns.map((column) => (
                    <th
                      key={column.header}
                      scope="col"
                      className={`py-2 text-xs font-bold text-text-secondary ${column.numeric ? 'text-right' : 'text-left'}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-black/5 last:border-0">
                    {tableColumns.map((column) => (
                      <td
                        key={column.header}
                        className={`py-1.5 text-text-primary ${column.numeric ? 'text-right tabular-nums' : 'text-left'}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
