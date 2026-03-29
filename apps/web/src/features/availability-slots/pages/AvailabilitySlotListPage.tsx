import { useState, useCallback, useMemo } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { SlotFilters } from '../components/SlotFilters';
import { SlotTable } from '../components/SlotTable';
import { SlotCalendarView } from '../components/SlotCalendarView';
import { SlotFormDrawer } from '../components/SlotFormDrawer';
import { SlotViewToggle, type SlotView } from '../components/SlotViewToggle';
import { useSlotList } from '../hooks/useSlotList';
import type { AvailabilitySlot } from '../types';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function AvailabilitySlotListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useSlotList();

  const [selectedView, setSelectedView] = useState<SlotView>('table');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editSlotId, setEditSlotId] = useState<string | null>(null);
  const [editSlotData, setEditSlotData] = useState<AvailabilitySlot | null>(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [calendarInspectorId, setCalendarInspectorId] = useState('');

  const handleNewSlot = useCallback(() => {
    setEditSlotId(null);
    setEditSlotData(null);
    setDrawerOpen(true);
  }, []);

  const handleEditSlot = useCallback((slot: AvailabilitySlot) => {
    setEditSlotId(slot.id);
    setEditSlotData(slot);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditSlotId(null);
    setEditSlotData(null);
  }, []);

  const handleSaved = useCallback(() => {
    handleCloseDrawer();
    refetch();
  }, [handleCloseDrawer, refetch]);

  const primaryAction = useMemo(() => ({
    label: 'New Slot',
    icon: 'mdi-plus',
    onClick: handleNewSlot,
  }), [handleNewSlot]);

  return (
    <>
      <ListFilterTableTemplate
        title="Availability Slots"
        primaryAction={primaryAction}
      >
        <div className="mb-4 flex items-center justify-end">
          <SlotViewToggle view={selectedView} onChange={setSelectedView} />
        </div>

        {selectedView === 'table' ? (
          <>
            <SlotFilters
              filters={filters}
              onFiltersChange={setFilters}
            />
            <div className="mt-4">
              <SlotTable
                data={data}
                loading={isLoading}
                error={isError ? (errorMessage ?? 'Failed to load availability slots') : undefined}
                onRetryError={refetch}
                pagination={pagination}
                onEdit={handleEditSlot}
              />
            </div>
          </>
        ) : (
          <SlotCalendarView
            slots={data}
            selectedInspectorId={calendarInspectorId}
            onInspectorChange={setCalendarInspectorId}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
          />
        )}
      </ListFilterTableTemplate>

      <SlotFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onSaved={handleSaved}
        slotId={editSlotId}
        initialData={editSlotData}
      />
    </>
  );
}
