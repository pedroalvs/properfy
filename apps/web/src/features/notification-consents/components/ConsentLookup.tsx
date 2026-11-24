import { useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { usePermissions } from '@/hooks/usePermissions';
import { formatInstantDateTime } from '@/lib/format-date';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { AgencySelect } from '@/features/apps/components/AgencySelect';
import { useConsentLookup, type ConsentRecord } from '../hooks/useConsentLookup';
import { ConsentOverrideModal } from './ConsentOverrideModal';

/**
 * Feature 018 US3: operator consent inspection.
 * Visible only to AM/OP. Recipient search + results table + skipped count.
 *
 * This is a submit-based lookup, not a live filter: an operator types a full
 * email/phone and searches once. That is why it keeps an explicit search form
 * (design-system Button) rather than the debounced FilterInput / live-filter
 * FilterBar — those fire on every keystroke, which is wrong for a recipient
 * lookup. The results table is the shared DataTable and the pre-search prompt is
 * the shared EmptyState.
 */
export function ConsentLookup() {
  const { hasRole } = usePermissions();
  const [searchInput, setSearchInput] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [activeRecipient, setActiveRecipient] = useState<string | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | undefined>(undefined);
  const [selectedConsent, setSelectedConsent] = useState<ConsentRecord | null>(null);

  const { data, isLoading, isError, error, refetch } = useConsentLookup({
    recipient: activeRecipient,
    tenantId: activeTenantId,
  });

  if (!hasRole('AM', 'OP')) {
    return (
      <div className="p-6">
        <InfoBanner variant="error">You do not have permission to view this page.</InfoBanner>
      </div>
    );
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    // An agency is mandatory: without a chosen tenantId we never fire the request.
    if (trimmed && tenantId) {
      setActiveRecipient(trimmed);
      setActiveTenantId(tenantId);
    }
  };

  const columns: DataTableColumn<ConsentRecord>[] = [
    { key: 'channel', label: 'Channel', render: (row) => row.channel },
    { key: 'notificationClass', label: 'Class', render: (row) => row.notificationClass },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span
          data-optout={row.optedOut}
          className={cn(
            'inline-block rounded px-2 py-0.5 text-xs font-semibold text-text-primary',
            row.optedOut ? 'bg-status-cancelled' : 'bg-status-done',
          )}
        >
          {row.optedOut ? 'Opted Out' : 'Opted In'}
        </span>
      ),
    },
    { key: 'changeSource', label: 'Source', render: (row) => row.changeSource ?? '—' },
    {
      key: 'changedAt',
      label: 'Changed at',
      render: (row) => (row.changedAt ? formatInstantDateTime(row.changedAt) : '—'),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) =>
        row.optedOut ? (
          <Button variant="outlined" onClick={() => setSelectedConsent(row)}>
            Override
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-secondary">Consent Lookup</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Look up a recipient&apos;s opt-out status across channels and classifications.
      </p>

      <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="consent-agency">
            Agency
          </label>
          <AgencySelect value={tenantId} onChange={setTenantId} aria-label="Agency" />
        </div>
        <div className="flex flex-1 gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter email or phone"
            className="flex-1 rounded border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:outline-none"
            aria-label="Recipient (email or phone)"
          />
          <Button type="submit" variant="primary" disabled={!searchInput.trim() || !tenantId}>
            Search
          </Button>
        </div>
      </form>

      {activeRecipient === null ? (
        <EmptyState
          icon="mdi-account-search-outline"
          title="Enter a recipient to search"
          description="Search by email or phone to see a recipient's opt-out status across channels and classifications."
        />
      ) : (
        <div className="rounded border border-border-subtle bg-card-bg p-4">
          {!isLoading && !isError && data && (
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm">
                Recipient: <span className="font-semibold">{data.recipient}</span>
              </div>
              <div className="text-xs text-text-muted">
                Skipped notifications: <span className="font-semibold">{data.skippedCount}</span>
              </div>
            </div>
          )}
          <DataTable
            columns={columns}
            data={data?.entries ?? []}
            loading={isLoading}
            error={isError ? `Failed to load consents: ${error?.message ?? 'Unknown error'}` : undefined}
            onRetryError={refetch}
            emptyMessage="No consent records for this recipient."
            keyExtractor={(row) => row.id}
          />
        </div>
      )}

      {selectedConsent && (
        <ConsentOverrideModal
          consent={selectedConsent}
          onClose={() => setSelectedConsent(null)}
          onSuccess={() => {
            setSelectedConsent(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
