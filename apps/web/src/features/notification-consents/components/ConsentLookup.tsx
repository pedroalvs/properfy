import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDateTime } from '@/lib/format-date';
import { useConsentLookup, type ConsentRecord } from '../hooks/useConsentLookup';
import { ConsentOverrideModal } from './ConsentOverrideModal';

/**
 * Feature 018 US3: operator consent inspection.
 * Visible only to AM/OP. Recipient search + results table + skipped count.
 */
export function ConsentLookup() {
  const { hasRole } = usePermissions();
  const [searchInput, setSearchInput] = useState('');
  const [activeRecipient, setActiveRecipient] = useState<string | null>(null);
  const [selectedConsent, setSelectedConsent] = useState<ConsentRecord | null>(null);

  const { data, isLoading, isError, error, refetch } = useConsentLookup({
    recipient: activeRecipient,
  });

  if (!hasRole('AM', 'OP')) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          You do not have permission to view this page.
        </div>
      </div>
    );
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      setActiveRecipient(trimmed);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-secondary">Consent Lookup</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Look up a recipient's opt-out status across channels and classifications.
      </p>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Enter email or phone"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          aria-label="Recipient (email or phone)"
        />
        <button
          type="submit"
          disabled={!searchInput.trim()}
          className="rounded bg-[#F37A76] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E8665F] disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {activeRecipient && (
        <div className="rounded border border-gray-200 bg-white p-4">
          {isLoading && <div className="text-sm text-text-secondary">Loading consents…</div>}
          {isError && (
            <div className="text-sm text-red-600">
              Failed to load consents: {error?.message ?? 'Unknown error'}
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm">
                  Recipient: <span className="font-semibold">{data.recipient}</span>
                </div>
                <div className="text-xs text-text-muted">
                  Skipped notifications: <span className="font-semibold">{data.skippedCount}</span>
                </div>
              </div>
              {data.entries.length === 0 ? (
                <div className="py-6 text-center text-sm text-text-muted">
                  No consent records for this recipient.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs font-bold text-text-secondary">
                    <tr>
                      <th className="py-2">Channel</th>
                      <th className="py-2">Class</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Source</th>
                      <th className="py-2">Changed at</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100">
                        <td className="py-2">{entry.channel}</td>
                        <td className="py-2">{entry.notificationClass}</td>
                        <td className="py-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                              entry.optedOut
                                ? 'bg-[#FFCDD2] text-[#B71C1C]'
                                : 'bg-[#C8E6C9] text-[#1B5E20]'
                            }`}
                          >
                            {entry.optedOut ? 'Opted Out' : 'Opted In'}
                          </span>
                        </td>
                        <td className="py-2">{entry.changeSource ?? '—'}</td>
                        <td className="py-2 text-text-secondary">
                          {entry.changedAt ? formatDateTime(entry.changedAt) : '—'}
                        </td>
                        <td className="py-2">
                          {entry.optedOut && (
                            <button
                              onClick={() => setSelectedConsent(entry)}
                              className="text-xs text-primary underline hover:text-primary/80"
                            >
                              Override
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
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
