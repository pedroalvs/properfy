import { useMemo, useState } from 'react';
import { INSPECTOR_NOTICE_SELECTED_MAX } from '@properfy/shared';
import { ErrorState } from '@/components/feedback/ErrorState';
import { FilterInput } from '@/components/filters/FilterInput';
import { useActiveInspectorOptions } from '../hooks/useActiveInspectorOptions';

export interface InspectorMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Validation error from the parent form (e.g. "Select at least one inspector"). */
  error?: string;
  disabled?: boolean;
}

const OVER_CAP_MESSAGE = `You can select up to ${INSPECTOR_NOTICE_SELECTED_MAX} inspectors. Use All active inspectors or Region instead.`;

/**
 * Form multi-select for the "Selected inspectors" audience. There is no generic
 * form multi-select in web (`FilterMultiSelect` is a filter-bar widget), so this
 * is scoped to the feature. Native checkboxes keep it keyboard-operable (Space
 * toggles) without an ARIA listbox contract.
 */
export function InspectorMultiSelect({ selectedIds, onChange, error, disabled }: InspectorMultiSelectProps) {
  const { options, isLoading, isError, refetch } = useActiveInspectorOptions(true);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || (o.email ?? '').toLowerCase().includes(q),
    );
  }, [options, search]);

  const overCap = selectedIds.length > INSPECTOR_NOTICE_SELECTED_MAX;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function selectAllShown() {
    const next = new Set(selected);
    for (const o of filtered) next.add(o.id);
    onChange([...next]);
  }

  if (isLoading) {
    return (
      <p role="status" className="px-3 py-2 text-sm text-text-secondary">
        Loading inspectors…
      </p>
    );
  }
  if (isError) {
    return <ErrorState message="Couldn't load inspectors." onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <FilterInput
        label="Search inspectors"
        value={search}
        onChange={setSearch}
        placeholder="Search inspectors"
      />
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span aria-live="polite">{selectedIds.length} selected</span>
        <span className="flex gap-3">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            onClick={selectAllShown}
            disabled={disabled || filtered.length === 0}
          >
            Select all shown
          </button>
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            onClick={() => onChange([])}
            disabled={disabled || selectedIds.length === 0}
          >
            Clear
          </button>
        </span>
      </div>
      <ul className="max-h-[280px] overflow-y-auto rounded border border-border-light">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-text-secondary">No inspectors match your search.</li>
        ) : (
          filtered.map((o) => (
            <li key={o.id} className="border-b border-border-light last:border-b-0">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-hover-row">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  disabled={disabled}
                />
                <span className="flex flex-col">
                  <span className="text-sm text-text-primary">{o.name}</span>
                  {o.email && <span className="text-xs text-text-secondary">{o.email}</span>}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
      {(overCap || error) && (
        <p className="text-sm text-error" role="alert">
          {overCap ? OVER_CAP_MESSAGE : error}
        </p>
      )}
    </div>
  );
}
