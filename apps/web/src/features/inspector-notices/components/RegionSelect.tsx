import { useMemo } from 'react';
import { SelectInput } from '@/components/forms/SelectInput';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useActiveRegionOptions } from '../hooks/useActiveRegionOptions';

export interface RegionSelectProps {
  value: string;
  onChange: (regionId: string) => void;
  /** Validation error from the parent form (e.g. "Select a region"). */
  error?: string;
  disabled?: boolean;
  id?: string;
}

function inspectorLabel(count: number): string {
  return `${count} inspector${count === 1 ? '' : 's'}`;
}

/** Region picker for the "Region" audience — ACTIVE regions only, with a warning
 * when the chosen region has no inspectors. */
export function RegionSelect({ value, onChange, error, disabled, id }: RegionSelectProps) {
  const { options, isLoading, isError, refetch } = useActiveRegionOptions(true);

  const selectOptions = useMemo(
    () => options.map((r) => ({ value: r.id, label: `${r.name} (${inspectorLabel(r.inspectorCount)})` })),
    [options],
  );

  const chosen = options.find((r) => r.id === value);
  const emptyRegion = chosen?.inspectorCount === 0;

  if (isError) {
    return <ErrorState message="Couldn't load regions." onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-1">
      <SelectInput
        id={id}
        value={value}
        onChange={onChange}
        options={selectOptions}
        placeholder={isLoading ? 'Loading regions…' : 'Choose a region'}
        disabled={disabled || isLoading}
        error={!!error}
      />
      {emptyRegion && (
        <p className="text-sm text-warning">This region has no inspectors.</p>
      )}
      {error && (
        <p className="text-sm text-error" role="alert">{error}</p>
      )}
    </div>
  );
}
