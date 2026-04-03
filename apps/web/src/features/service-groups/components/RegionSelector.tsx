import { useMemo } from 'react';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useResolveRegions } from '../hooks/useResolveRegions';

interface RegionSelectorProps {
  appointmentIds: string[];
  selectedRegionId: string;
  onRegionChange: (regionId: string) => void;
}

export function RegionSelector({ appointmentIds, selectedRegionId, onRegionChange }: RegionSelectorProps) {
  const { data, isLoading, isError } = useResolveRegions(appointmentIds);

  const options = useMemo(() => {
    if (!data?.regions) return [];
    return data.regions.map((r) => ({
      value: r.regionId,
      label: `${r.regionName} (${r.matchedAppointmentCount}/${data.totalAppointments})`,
    }));
  }, [data]);

  const selectedRegion = data?.regions.find((r) => r.regionId === selectedRegionId);
  const unmatchedCount = data?.unmatchedAppointmentIds.length ?? 0;
  const hasPartialMatch = unmatchedCount > 0 && (data?.regions.length ?? 0) > 0;
  const hasNoMatch = (data?.regions.length ?? 0) === 0 && !isLoading && appointmentIds.length > 0;
  const noInspectors = selectedRegion && selectedRegion.inspectorCount === 0;

  if (isLoading) {
    return (
      <FormField label="Target Region">
        <LoadingState rows={1} />
      </FormField>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Target Region" hint="Determines which inspectors see this group on the marketplace">
        <SelectInput
          value={selectedRegionId}
          onChange={onRegionChange}
          options={options}
          placeholder={hasNoMatch ? 'No matching regions found' : 'Select a region'}
          disabled={hasNoMatch}
          aria-label="Target Region"
        />
      </FormField>

      {isError && (
        <div className="rounded border border-error/40 bg-error/5 p-3 text-sm text-error">
          Failed to resolve regions for the selected appointments. Try again or proceed without a region.
        </div>
      )}

      {hasPartialMatch && selectedRegionId && (
        <InfoBanner>
          {unmatchedCount} of {data!.totalAppointments} appointment{unmatchedCount > 1 ? 's' : ''} could not be matched to any region (missing coordinates or outside all regions).
        </InfoBanner>
      )}

      {hasNoMatch && (
        <InfoBanner>
          No active regions contain these appointments. You can{' '}
          <a href="/service-regions" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            manage regions
          </a>{' '}
          or assign an inspector manually after creation.
        </InfoBanner>
      )}

      {noInspectors && (
        <InfoBanner>
          No inspectors are currently assigned to this region. Publishing will not generate marketplace offers until inspectors are assigned.
        </InfoBanner>
      )}
    </div>
  );
}
