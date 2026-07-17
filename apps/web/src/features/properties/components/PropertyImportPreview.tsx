import { useState, useMemo } from 'react';
import type { ResolvedPropertyImportRow, ImportSummary } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { geocodeVerificationToStatus } from '@/lib/geocode-verification';
import { GeocodingStatusBadge } from './GeocodingStatusBadge';

const PAGE_SIZE = 20;

const SEVERITY_STYLE: Record<ResolvedPropertyImportRow['severity'], { label: string; bg: string; text: string }> = {
  ready: { label: 'Ready', bg: 'var(--color-success)', text: '#fff' },
  warning: { label: 'Warning', bg: 'var(--color-warning)', text: '#fff' },
  error: { label: 'Error', bg: 'var(--color-error)', text: '#fff' },
};

interface PropertyImportPreviewProps {
  rows: ResolvedPropertyImportRow[];
  summary: ImportSummary;
}

function PropertyBadge({ property }: { property: ResolvedPropertyImportRow['property'] }) {
  if (!property) return <span className="text-xs text-text-muted">&mdash;</span>;

  const addressLabel = [property.street, property.addressLine2, property.suburb, property.state, property.postcode]
    .filter(Boolean)
    .join(', ');
  const geocodeStatus = geocodeVerificationToStatus(property.geocode);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <StatusChip
          label={property.resolution === 'existing' ? 'Existing property' : 'New property'}
          bg={property.resolution === 'existing' ? 'var(--color-info)' : 'var(--color-accent)'}
          text="#fff"
        />
        {geocodeStatus && <GeocodingStatusBadge status={geocodeStatus} size="sm" />}
        {property.duplicateOfRow != null && (
          <span className="text-xs text-text-muted">(same as row {property.duplicateOfRow})</span>
        )}
      </div>
      <p className="text-xs text-text-secondary">{addressLabel}</p>
      {property.propertyCode && <p className="text-xs text-text-muted">{property.propertyCode}</p>}
    </div>
  );
}

export function PropertyImportPreview({ rows, summary }: PropertyImportPreviewProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Clamped rather than reset via an effect: if `rows` shrinks (e.g. the
  // operator re-previews a smaller file while on page 3), this derives a
  // valid page directly instead of briefly rendering an empty page.
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [rows, currentPage],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
          <p className="text-xl font-bold text-text-primary">{summary.totalRows}</p>
          <p className="text-xs font-semibold text-text-muted">Total Rows</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-success)]">{summary.importable}</p>
          <p className="text-xs font-semibold text-text-muted">Importable</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-warning)]">{summary.withWarnings}</p>
          <p className="text-xs font-semibold text-text-muted">Warnings</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-error)]">{summary.withErrors}</p>
          <p className="text-xs font-semibold text-text-muted">Errors</p>
        </div>
      </div>

      <div className="space-y-3">
        {pageRows.map((row) => {
          const severityStyle = SEVERITY_STYLE[row.severity];
          return (
            <div
              key={row.rowNumber}
              data-testid={`preview-row-${row.rowNumber}`}
              className={`rounded-lg border p-4 ${
                row.severity === 'error' ? 'border-red-200 bg-red-50' : row.severity === 'warning' ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">Row {row.rowNumber}</span>
                  <StatusChip label={severityStyle.label} bg={severityStyle.bg} text={severityStyle.text} />
                  {!row.importable && <span className="text-xs font-semibold text-[var(--color-error)]">Not importable</span>}
                </div>
                <div className="text-xs text-text-secondary">
                  {row.propertyCode ?? '—'} &middot; {row.type ?? '—'}
                </div>
              </div>

              <div className="mt-3">
                <PropertyBadge property={row.property} />
              </div>

              {row.notes && <p className="mt-2 text-xs text-text-muted">{row.notes}</p>}

              {row.issues.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-gray-200 pt-2">
                  {row.issues.map((issue, idx) => (
                    <li
                      key={idx}
                      className={`text-xs ${issue.severity === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}
                    >
                      <i
                        className={`mdi ${issue.severity === 'error' ? 'mdi-alert-circle' : 'mdi-alert'} mr-1`}
                        aria-hidden="true"
                      />
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outlined" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
            Previous
          </Button>
          <span className="text-xs text-text-muted">
            Rows {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <Button variant="outlined" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
