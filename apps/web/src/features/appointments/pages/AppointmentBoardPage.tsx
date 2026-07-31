import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { wasRentalTenantNotified } from '../lib/rental-tenant-notice';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentBoardColumn } from '../components/AppointmentBoardColumn';
import { AppointmentBulkActionBar } from '../components/AppointmentBulkActionBar';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AssignInspectorModal } from '../components/AssignInspectorModal';
import { BulkEditModal } from '../components/BulkEditModal';
import { StatusTransitionDialog } from '../components/StatusTransitionDialog';
import type { BoardCardAction } from '../components/AppointmentBoardCard';
import { useAppointmentBoard } from '../hooks/useAppointmentBoard';
import { useServiceTypeFilterOptions, useBranchOptionsFromAppointments } from '../hooks/useAppointmentFilterOptions';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { useBulkResendHandler } from '../hooks/useBulkResendHandler';
import { getAvailableTransitions } from '../lib/transitions';
import { isAppointmentScheduleEditable } from '../lib/editability';
import { DEFAULT_FILTERS } from '../types';
import type { Appointment } from '../types';

/**
 * Filters the board hides. They may still sit in the URL (carried over from the
 * list) but are inert here, so they must not make the board claim it is filtered.
 */
const BOARD_HIDDEN_FILTERS = ['status', 'showCancelled'] as const;

/**
 * "Service Dashboard" — the column-per-status board from the client scope §4.3.
 * Read-only with respect to dragging: cards never move by drag, every status
 * change still goes through the existing transition dialogs and their RBAC and
 * reason rules.
 */
export function AppointmentBoardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canPerform, hasRole, role } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');

  const { columns, allItems, filters, setFilters, refetchAll } = useAppointmentBoard();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const canCreate = canPerform('appointment.create');
  const canBulkEdit = canPerform('appointment.cancel');
  const canBulkResend = canPerform('appointment.bulk_resend_reminder');

  const serviceTypeOptions = useServiceTypeFilterOptions();
  // AM/OP-only route, so unlike the list there is no CL branch of this logic:
  // branches always come from the loaded rows.
  const branchOptions = useBranchOptionsFromAppointments(allItems);

  const hasActiveFilters = useMemo(
    () =>
      (Object.keys(DEFAULT_FILTERS) as (keyof typeof DEFAULT_FILTERS)[])
        .filter((key) => !BOARD_HIDDEN_FILTERS.includes(key as never))
        .some((key) => filters[key] !== DEFAULT_FILTERS[key]),
    [filters],
  );

  // Selected ids can outlive the cards that produced them: changing a filter, or
  // a column going idle, unloads rows while the selection persists. Every bulk
  // surface must agree, so they all read the selection intersected with what is
  // actually on screen.
  const loadedIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);
  const effectiveSelectedIds = useMemo(
    () => selectedIds.filter((id) => loadedIds.has(id)),
    [selectedIds, loadedIds],
  );
  // Derived from allItems, so already limited to what is loaded.
  const selectedAppointments = useMemo(
    () => allItems.filter((item) => selectedIds.includes(item.id)),
    [allItems, selectedIds],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((sid) => sid !== id) : [...current, id],
    );
  }, []);

  const toggleSelectAll = useCallback((ids: string[], allSelected: boolean) => {
    setSelectedIds((current) => {
      if (allSelected) return current.filter((id) => !ids.includes(id));
      const existing = new Set(current);
      return [...current, ...ids.filter((id) => !existing.has(id))];
    });
  }, []);

  const cancelTransition = useAppointmentTransition(cancelTarget?.id ?? null, () => {
    // Per-card cancel is independent of the bulk workflow: drop only the card
    // that was cancelled, never the user's whole selection.
    const cancelledId = cancelTarget?.id;
    setCancelTarget(null);
    if (cancelledId) {
      setSelectedIds((current) => current.filter((id) => id !== cancelledId));
    }
  });

  const buildCardActions = useCallback(
    (appointment: Appointment): BoardCardAction[] => {
      const actions: BoardCardAction[] = [];

      // Mirrors AppointmentDetailPage: assigning is how AWAITING_INSPECTOR
      // becomes SCHEDULED — it is not a raw status transition.
      if (isGlobalRole && appointment.status === 'AWAITING_INSPECTOR' && !appointment.inspectorId) {
        actions.push({
          icon: 'mdi-account-plus-outline',
          label: 'Assign inspector',
          onClick: () => setAssignId(appointment.id),
        });
      }

      // CANCELLED and DONE are not editable (backend `isScheduleEditable`), so
      // offering the pencil there would open a drawer whose Save always fails.
      if (isGlobalRole && isAppointmentScheduleEditable(appointment.status)) {
        actions.push({
          icon: 'mdi-pencil-outline',
          label: 'Edit',
          onClick: () => {
            setEditId(appointment.id);
            setFormOpen(true);
          },
        });
      }

      const canCancelThis = getAvailableTransitions(appointment.status, role ?? '').some(
        (transition) => transition.targetStatus === 'CANCELLED',
      );
      if (canPerform('appointment.cancel') && canCancelThis) {
        actions.push({
          icon: 'mdi-cancel',
          label: 'Cancel',
          onClick: () => setCancelTarget(appointment),
        });
      }

      return actions;
    },
    [isGlobalRole, role, canPerform],
  );

  const bulkResend = useBulkResendHandler(effectiveSelectedIds, clearSelection);

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Service Dashboard"
        primaryAction={
          canCreate
            ? {
                label: 'New Appointment',
                icon: 'mdi-plus',
                onClick: () => {
                  setEditId(null);
                  setFormOpen(true);
                },
              }
            : undefined
        }
        secondaryActions={[
          {
            label: 'List',
            icon: 'mdi-format-list-bulleted',
            // Carry filters back — both screens read the same URL params.
            onClick: () => navigate({ pathname: '/appointments', search: location.search }),
          },
          { label: 'Map View', icon: 'mdi-map-outline', onClick: () => navigate('/map') },
        ]}
      />

      <AppointmentFilters
        filters={filters}
        onFiltersChange={setFilters}
        branchOptions={branchOptions}
        serviceTypeOptions={serviceTypeOptions}
        hiddenFilters={BOARD_HIDDEN_FILTERS}
      />

      <InfoBanner className="mt-2">
        Draft appointments are not shown on the board.{' '}
        <Link to="/appointments" className="font-semibold underline">
          View them in the list
        </Link>
        .
      </InfoBanner>

      <div className={`mt-3 min-h-0 flex-1 overflow-x-auto ${effectiveSelectedIds.length > 0 ? 'pb-16' : ''}`}>
        <div className="flex h-full gap-3">
          {columns.map((column) => (
            <AppointmentBoardColumn
              key={column.status}
              column={column}
              selectedIds={effectiveSelectedIds}
              onToggleSelect={canBulkEdit ? toggleSelect : undefined}
              onToggleSelectAll={canBulkEdit ? toggleSelectAll : undefined}
              buildCardActions={buildCardActions}
              hasActiveFilters={hasActiveFilters}
            />
          ))}
        </div>
      </div>

      {canBulkEdit && (
        <AppointmentBulkActionBar
          selectedCount={effectiveSelectedIds.length}
          onClearSelection={clearSelection}
          onBulkEdit={() => setBulkEditOpen(true)}
          canBulkResend={canBulkResend}
          onBulkResend={bulkResend.resend}
          resendPending={bulkResend.isPending}
        />
      )}

      <AppointmentFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        appointmentId={editId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetchAll();
        }}
      />

      {assignId && (
        <AssignInspectorModal
          open
          appointmentId={assignId}
          onClose={() => setAssignId(null)}
          onSuccess={() => {
            setAssignId(null);
            refetchAll();
          }}
        />
      )}

      <StatusTransitionDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={({ reason, reasonCode, notifyRentalTenant }) =>
          cancelTransition.transition('CANCELLED', reason, reasonCode, notifyRentalTenant)
        }
        title="Cancel Appointment"
        message={`Cancel appointment ${cancelTarget?.code ?? ''}? This requires a reason.`}
        variant="danger"
        targetStatus="CANCELLED"
        rentalTenantNotified={!!cancelTarget && wasRentalTenantNotified(cancelTarget)}
        loading={cancelTransition.isTransitioning}
      />

      <BulkEditModal
        selectedAppointments={selectedAppointments}
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        onSuccess={() => {
          setBulkEditOpen(false);
          setSelectedIds([]);
          refetchAll();
        }}
      />
    </div>
  );
}
