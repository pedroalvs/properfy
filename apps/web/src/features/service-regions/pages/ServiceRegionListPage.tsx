import { useState, useCallback, useMemo } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceRegionFilters } from '../components/ServiceRegionFilters';
import { ServiceRegionTable } from '../components/ServiceRegionTable';
import { ServiceRegionFormDrawer } from '../components/ServiceRegionFormDrawer';
import { RegionMap } from '../components/RegionMap';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { useServiceRegionList } from '../hooks/useServiceRegionList';
import { useServiceRegionDeactivate } from '../hooks/useServiceRegionDeactivate';
import { useServiceRegionDelete } from '../hooks/useServiceRegionDelete';
import { useServiceRegionSave } from '../hooks/useServiceRegionSave';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { ServiceRegion } from '../types';

export function ServiceRegionListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useServiceRegionList();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Deactivate state
  const [deactivatingRegion, setDeactivatingRegion] = useState<ServiceRegion | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  // Delete state
  const [deletingRegion, setDeletingRegion] = useState<ServiceRegion | null>(null);

  const { deactivate, isDeactivating } = useServiceRegionDeactivate(
    deactivatingRegion?.id ?? null,
    () => {
      setDeactivatingRegion(null);
      setDeactivateReason('');
      setReasonError('');
      refetch();
    },
  );

  const { remove, isDeleting } = useServiceRegionDelete(
    deletingRegion?.id ?? null,
    () => {
      setDeletingRegion(null);
      refetch();
    },
  );

  const handleEdit = useCallback((region: ServiceRegion) => {
    setEditId(region.id);
    setFormOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    refetch();
  }, [refetch]);

  const handleDeactivateClick = useCallback((region: ServiceRegion) => {
    setDeactivatingRegion(region);
    setDeactivateReason('');
    setReasonError('');
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    if (!deactivateReason.trim()) {
      setReasonError('Reason is required');
      return;
    }
    deactivate(deactivateReason.trim());
  }, [deactivateReason, deactivate]);

  const handleCancelDeactivate = useCallback(() => {
    setDeactivatingRegion(null);
    setDeactivateReason('');
    setReasonError('');
  }, []);

  const { save: saveRegion } = useServiceRegionSave();
  const { showSuccess, showError } = useSnackbar();

  const handleActivate = useCallback(async (region: ServiceRegion) => {
    const result = await saveRegion({ name: region.name, geojson: region.geojson, color: region.color, status: 'ACTIVE' }, region.id);
    if (result.success) {
      showSuccess(`Region "${region.name}" activated`);
      refetch();
    } else {
      showError(result.error ?? 'Failed to activate region');
    }
  }, [saveRegion, refetch, showSuccess, showError]);

  const handleDeleteClick = useCallback((region: ServiceRegion) => {
    setDeletingRegion(region);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    remove();
  }, [remove]);

  const handleCancelDelete = useCallback(() => {
    setDeletingRegion(null);
  }, []);

  const existingRegions = useMemo(() =>
    data
      .filter((r) => {
        const geo = r.geojson as { type?: string; coordinates?: unknown };
        return geo?.type === 'Polygon' && geo.coordinates;
      })
      .map((r) => ({
        id: r.id,
        geojson: r.geojson,
        color: r.color,
        name: r.name,
      })),
    [data],
  );

  return (
    <>
      <ListFilterTableTemplate
        title="Service Regions"
        primaryAction={{
          label: 'New Region',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        {existingRegions.length > 0 && (
          <div className="mb-4">
            <RegionMap
              existingRegions={existingRegions}
              editable={false}
              height="300px"
            />
          </div>
        )}
        <ServiceRegionFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ServiceRegionTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load service regions') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={handleEdit}
          onDeactivate={handleDeactivateClick}
          onActivate={handleActivate}
          onDelete={handleDeleteClick}
        />
      </ListFilterTableTemplate>
      <ServiceRegionFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        regionId={editId}
        onSaved={handleSaved}
      />

      {/* Deactivate dialog with reason */}
      <Dialog
        open={!!deactivatingRegion}
        onClose={handleCancelDeactivate}
        title="Deactivate Service Region"
        actions={
          <>
            <Button variant="secondary" onClick={handleCancelDeactivate}>
              Cancel
            </Button>
            <Button
              className="bg-error text-white hover:brightness-95 active:brightness-90"
              onClick={handleConfirmDeactivate}
              loading={isDeactivating}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Are you sure you want to deactivate &quot;{deactivatingRegion?.name}&quot;? Please provide a reason.
          </p>
          <Textarea
            value={deactivateReason}
            onChange={setDeactivateReason}
            rows={3}
            placeholder="Reason for deactivation"
            aria-label="Deactivation reason"
          />
          {reasonError && (
            <p className="text-sm text-error">{reasonError}</p>
          )}
        </div>
      </Dialog>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deletingRegion}
        title="Delete Service Region"
        message={`Are you sure you want to permanently delete "${deletingRegion?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={handleCancelDelete}
      />
    </>
  );
}
