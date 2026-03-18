import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { MapContainer } from '@/components/map/MapContainer';
import { MapMarker } from '@/components/map/MapMarker';
import { MapPopup } from '@/components/map/MapPopup';
import { MapFiltersPanel } from '@/components/map/MapFiltersPanel';
import { MapFloatingAction } from '@/components/map/MapFloatingAction';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterInput } from '@/components/filters/FilterInput';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { SERVICE_GROUP_STATUS_MAP, PRIORITY_MODE_MAP } from '@/lib/status-colors';
import type { ServiceGroupStatus, PriorityMode } from '@properfy/shared';
import { useServiceGroupMapData, type ServiceGroupMapItem } from '../hooks/useServiceGroupMapData';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#CE93D8',
  PUBLISHED: '#FFB74D',
  ACCEPTED: '#81C784',
  CANCELLED: '#EF5350',
};

export function ServiceGroupMapPage() {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    selectedGroupId,
    setSelectedGroupId,
  } = useServiceGroupMapData();

  const [popupAppointment, setPopupAppointment] = useState<{
    id: string;
    code: string;
    status: string;
    address: string;
  } | null>(null);

  const selectedGroup = data.find((g) => g.id === selectedGroupId) ?? null;
  const visibleAppointments = selectedGroup?.appointments ?? [];

  const handleGroupClick = useCallback(
    (group: ServiceGroupMapItem) => {
      setSelectedGroupId(group.id === selectedGroupId ? null : group.id);
      setPopupAppointment(null);
    },
    [selectedGroupId, setSelectedGroupId],
  );

  const handleRecenter = useCallback(() => {
    setPopupAppointment(null);
  }, []);

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-secondary">Service Groups</h2>
        <p className="text-xs text-text-muted">{data.length} groups</p>
      </div>

      <MapFiltersPanel>
        <div className="flex flex-col gap-3">
          <FilterSelect
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setFilters({ ...filters, status: value })}
          />
          <FilterInput
            label="Search"
            value={filters.search}
            onChange={(value) => setFilters({ ...filters, search: value })}
            placeholder="Search groups..."
          />
        </div>
      </MapFiltersPanel>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />}
        {!isLoading && !isError && data.length === 0 && (
          <EmptyState title="No service groups found" />
        )}
        {data.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
              selectedGroupId === group.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
            }`}
            onClick={() => handleGroupClick(group)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-secondary">{group.name}</span>
              <StatusChip
                label={SERVICE_GROUP_STATUS_MAP[group.status as ServiceGroupStatus]?.label ?? group.status}
                bg={SERVICE_GROUP_STATUS_MAP[group.status as ServiceGroupStatus]?.bg ?? '#E0E0E0'}
              />
            </div>
            {group.regionName && (
              <p className="mt-1 text-xs text-text-secondary">{group.regionName}</p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {group.appointmentsCount} appointment{group.appointmentsCount !== 1 ? 's' : ''}
              </span>
              <StatusChip
                label={PRIORITY_MODE_MAP[group.priorityMode as PriorityMode]?.label ?? group.priorityMode}
                bg={PRIORITY_MODE_MAP[group.priorityMode as PriorityMode]?.bg ?? '#E0E0E0'}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const mapContent = (
    <div className="relative h-full">
      <MapContainer>
        {visibleAppointments.map((apt) => (
          <MapMarker
            key={apt.id}
            longitude={apt.longitude}
            latitude={apt.latitude}
            color={STATUS_COLORS[selectedGroup?.status ?? ''] ?? '#9E9E9E'}
            label={apt.code}
            active={popupAppointment?.id === apt.id}
            onClick={() => setPopupAppointment(apt)}
          />
        ))}
      </MapContainer>

      {!selectedGroup && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50">
          <p className="text-sm text-text-muted">Select a service group to view appointments on map</p>
        </div>
      )}

      {popupAppointment && (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2">
          <MapPopup
            title={popupAppointment.code}
            onClose={() => setPopupAppointment(null)}
            actions={[
              { label: 'View Details', onClick: () => navigate(`/appointments/${popupAppointment.id}`) },
            ]}
          >
            <div className="space-y-1">
              <p>
                <span className="text-text-muted">Status:</span> {popupAppointment.status}
              </p>
              <p>
                <span className="text-text-muted">Address:</span> {popupAppointment.address}
              </p>
            </div>
          </MapPopup>
        </div>
      )}

      <MapFloatingAction
        actions={[
          { icon: 'mdi-crosshairs-gps', label: 'Re-center', onClick: handleRecenter },
        ]}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Service Group Map"
        secondaryActions={[
          { label: 'List View', icon: 'mdi-format-list-bulleted', onClick: () => navigate('/service-groups') },
        ]}
      />
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} />
    </div>
  );
}
