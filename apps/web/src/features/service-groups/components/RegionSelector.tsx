import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useResolveRegions } from '../hooks/useResolveRegions';

interface RegionSelectorProps {
  appointmentIds: string[];
  selectedRegionId: string;
  onRegionChange: (regionId: string) => void;
  /** Required for AM/OP creating a group on behalf of a selected agency. */
  tenantId?: string;
  /** Override the field hint (defaults to the creation-flow copy). */
  hint?: string;
}

export function RegionSelector({
  appointmentIds,
  selectedRegionId,
  onRegionChange,
  tenantId,
  hint = 'Optional at creation. Required to publish — you can add it later via Edit Group.',
}: RegionSelectorProps) {
  const { data, isLoading, isError } = useResolveRegions(appointmentIds, tenantId);

  const options = useMemo(() => {
    if (!data?.regions) return [];
    return data.regions.map((r) => ({
      value: r.regionId,
      label: `${r.regionName} (${r.matchedAppointmentCount}/${data.totalAppointments})`,
    }));
  }, [data]);

  const selectedRegion = data?.regions?.find((r) => r.regionId === selectedRegionId);
  const unmatchedCount = data?.unmatchedAppointmentIds.length ?? 0;
  const hasPartialMatch = unmatchedCount > 0 && (data?.regions.length ?? 0) > 0;
  const hasNoMatch = (data?.regions.length ?? 0) === 0 && !isLoading && !isError && appointmentIds.length > 0;
  const noInspectors = !!(selectedRegion && selectedRegion.inspectorCount === 0);

  if (isLoading) {
    return (
      <FormField label="Target Region">
        <LoadingState rows={1} />
      </FormField>
    );
  }

  // One banner at a time — priority: isError > hasNoMatch > hasPartialMatch > noInspectors.
  const banner = isError ? (
    <InfoBanner>
      Failed to load regions. Retry or skip — you can add a region when editing the group before publishing.
    </InfoBanner>
  ) : hasNoMatch ? (
    <InfoBanner>
      No active regions contain these appointments. You can{' '}
      <Link to="/service-regions" className="font-semibold underline">
        manage regions
      </Link>{' '}
      or assign an inspector manually after creation.
    </InfoBanner>
  ) : hasPartialMatch && selectedRegionId ? (
    <InfoBanner>
      {unmatchedCount} of {data!.totalAppointments} appointment{unmatchedCount > 1 ? 's' : ''} could not be matched to any region (missing coordinates or outside all regions).
    </InfoBanner>
  ) : noInspectors ? (
    <InfoBanner>
      No inspectors are currently assigned to this region. Publishing will not generate marketplace offers until inspectors are assigned.
    </InfoBanner>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label="Target Region"
        hint={hint}
      >
        <SelectInput
          value={selectedRegionId}
          onChange={onRegionChange}
          options={options}
          placeholder={hasNoMatch ? 'No matching regions found' : 'Select a region'}
          disabled={hasNoMatch}
          aria-label="Target Region"
        />
      </FormField>

      {banner}
    </div>
  );
}
