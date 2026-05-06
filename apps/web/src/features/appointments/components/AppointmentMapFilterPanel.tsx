import { useState } from 'react';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterInput } from '@/components/filters/FilterInput';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { FilterBoolean } from '@/components/filters/FilterBoolean';
import { APPOINTMENT_STATUS_MAP, SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';

export type FilterMode = 'appointments' | 'groups';

export interface AppointmentModeFilters {
  search: string;
  statuses: string[];
  serviceTypeId: string;
  contactSearch: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
  timeSlot: string;
  confirmationStatus: string;
  showGrouped: boolean;
}

export interface GroupModeFilters {
  search: string;
  statuses: string[];
  contactSearch: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_APPOINTMENT_FILTERS: AppointmentModeFilters = {
  search: '',
  statuses: ['DRAFT', 'REJECTED'],
  serviceTypeId: '',
  contactSearch: '',
  branchId: '',
  dateFrom: '',
  dateTo: '',
  timeSlot: '',
  confirmationStatus: '',
  showGrouped: false,
};

export const DEFAULT_GROUP_FILTERS: GroupModeFilters = {
  search: '',
  statuses: ['DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED'],
  contactSearch: '',
  branchId: '',
  dateFrom: '',
  dateTo: '',
};

const MODE_OPTIONS = [
  { label: 'Appointments', value: 'appointments' },
  { label: 'Groups', value: 'groups' },
];

const APPOINTMENT_STATUS_OPTIONS = Object.entries(APPOINTMENT_STATUS_MAP).map(
  ([value, config]) => ({ label: config.label, value }),
);

const GROUP_STATUS_OPTIONS = Object.entries(SERVICE_GROUP_STATUS_MAP).map(
  ([value, config]) => ({ label: config.label, value }),
);

const CONFIRMATION_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Sent', value: 'sent' },
  { label: 'Not sent', value: 'not_sent' },
];

interface AppointmentMapFilterPanelProps {
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  appointmentFilters: AppointmentModeFilters;
  onAppointmentFiltersChange: (filters: AppointmentModeFilters) => void;
  groupFilters: GroupModeFilters;
  onGroupFiltersChange: (filters: GroupModeFilters) => void;
  serviceTypeOptions?: Array<{ label: string; value: string }>;
  branchOptions?: Array<{ label: string; value: string }>;
  timeSlotOptions?: Array<{ label: string; value: string }>;
}

export function AppointmentMapFilterPanel({
  mode,
  onModeChange,
  appointmentFilters,
  onAppointmentFiltersChange,
  groupFilters,
  onGroupFiltersChange,
  serviceTypeOptions = [],
  branchOptions = [],
  timeSlotOptions = [],
}: AppointmentMapFilterPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleStatus = (
    currentStatuses: string[],
    status: string,
  ): string[] => {
    return currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
  };

  return (
    <div className="border-b border-gray-200 bg-card-bg" data-testid="map-filter-panel">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-secondary hover:bg-gray-50"
        aria-expanded={!collapsed}
        aria-controls="map-filter-panel-content"
      >
        <span className="flex items-center gap-2">
          <i className="mdi mdi-filter-outline" aria-hidden="true" />
          Filters
        </span>
        <i
          className={`mdi ${collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'} text-text-muted`}
          aria-hidden="true"
        />
      </button>

      <div
        id="map-filter-panel-content"
        className={`overflow-hidden transition-all duration-200 ${
          collapsed ? 'max-h-0' : 'max-h-[800px]'
        }`}
      >
        <div className="space-y-3 px-4 pb-4">
          {/* Mode selector */}
          <FilterSelect
            label="Mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(v) => onModeChange(v as FilterMode)}
          />

          {mode === 'appointments' ? (
            <AppointmentModeFields
              filters={appointmentFilters}
              onChange={onAppointmentFiltersChange}
              toggleStatus={toggleStatus}
              serviceTypeOptions={serviceTypeOptions}
              branchOptions={branchOptions}
              timeSlotOptions={timeSlotOptions}
            />
          ) : (
            <GroupModeFields
              filters={groupFilters}
              onChange={onGroupFiltersChange}
              toggleStatus={toggleStatus}
              branchOptions={branchOptions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusMultiSelect({
  label,
  options,
  selectedValues,
  onToggle,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selectedValues.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentModeFields({
  filters,
  onChange,
  toggleStatus,
  serviceTypeOptions,
  branchOptions,
  timeSlotOptions,
}: {
  filters: AppointmentModeFilters;
  onChange: (f: AppointmentModeFilters) => void;
  toggleStatus: (current: string[], value: string) => string[];
  serviceTypeOptions: Array<{ label: string; value: string }>;
  branchOptions: Array<{ label: string; value: string }>;
  timeSlotOptions: Array<{ label: string; value: string }>;
}) {
  return (
    <>
      <FilterInput
        label="Search"
        value={filters.search}
        onChange={(v) => onChange({ ...filters, search: v })}
        placeholder="Code, address, contact..."
      />

      <StatusMultiSelect
        label="Status"
        options={APPOINTMENT_STATUS_OPTIONS}
        selectedValues={filters.statuses}
        onToggle={(s) => onChange({ ...filters, statuses: toggleStatus(filters.statuses, s) })}
      />

      {serviceTypeOptions.length > 0 && (
        <FilterSelect
          label="Service Type"
          value={filters.serviceTypeId}
          options={[{ label: 'All', value: '' }, ...serviceTypeOptions]}
          onChange={(v) => onChange({ ...filters, serviceTypeId: v })}
        />
      )}

      <FilterInput
        label="Contact"
        value={filters.contactSearch}
        onChange={(v) => onChange({ ...filters, contactSearch: v })}
        placeholder="Name, email, phone..."
      />

      {branchOptions.length > 0 && (
        <FilterSelect
          label="Branch"
          value={filters.branchId}
          options={[{ label: 'All', value: '' }, ...branchOptions]}
          onChange={(v) => onChange({ ...filters, branchId: v })}
        />
      )}

      <FilterDateRange
        label="Date Range"
        startDate={filters.dateFrom}
        endDate={filters.dateTo}
        onStartChange={(v) => onChange({ ...filters, dateFrom: v })}
        onEndChange={(v) => onChange({ ...filters, dateTo: v })}
      />

      {timeSlotOptions.length > 0 && (
        <FilterSelect
          label="Time"
          value={filters.timeSlot}
          options={[{ label: 'All', value: '' }, ...timeSlotOptions]}
          onChange={(v) => onChange({ ...filters, timeSlot: v })}
        />
      )}

      <FilterSelect
        label="Confirmation"
        value={filters.confirmationStatus}
        options={CONFIRMATION_OPTIONS}
        onChange={(v) => onChange({ ...filters, confirmationStatus: v })}
      />

      <FilterBoolean
        label="Show grouped appointments"
        value={filters.showGrouped}
        onChange={(v) => onChange({ ...filters, showGrouped: v })}
      />
    </>
  );
}

function GroupModeFields({
  filters,
  onChange,
  toggleStatus,
  branchOptions,
}: {
  filters: GroupModeFilters;
  onChange: (f: GroupModeFilters) => void;
  toggleStatus: (current: string[], value: string) => string[];
  branchOptions: Array<{ label: string; value: string }>;
}) {
  return (
    <>
      <FilterInput
        label="Search"
        value={filters.search}
        onChange={(v) => onChange({ ...filters, search: v })}
        placeholder="Group name, description..."
      />

      <StatusMultiSelect
        label="Status"
        options={GROUP_STATUS_OPTIONS}
        selectedValues={filters.statuses}
        onToggle={(s) => onChange({ ...filters, statuses: toggleStatus(filters.statuses, s) })}
      />

      <FilterInput
        label="Contact"
        value={filters.contactSearch}
        onChange={(v) => onChange({ ...filters, contactSearch: v })}
        placeholder="Name, email, phone..."
      />

      {branchOptions.length > 0 && (
        <FilterSelect
          label="Branch"
          value={filters.branchId}
          options={[{ label: 'All', value: '' }, ...branchOptions]}
          onChange={(v) => onChange({ ...filters, branchId: v })}
        />
      )}

      <FilterDateRange
        label="Date Range"
        startDate={filters.dateFrom}
        endDate={filters.dateTo}
        onStartChange={(v) => onChange({ ...filters, dateFrom: v })}
        onEndChange={(v) => onChange({ ...filters, dateTo: v })}
      />
    </>
  );
}
