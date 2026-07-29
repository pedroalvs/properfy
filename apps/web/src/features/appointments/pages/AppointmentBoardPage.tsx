import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { useFormOptions } from '@/hooks/useFormOptions';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentBoardColumn } from '../components/AppointmentBoardColumn';
import { AppointmentBulkActionBar } from '../components/AppointmentBulkActionBar';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AssignInspectorModal } from '../components/AssignInspectorModal';
import { BulkEditModal } from '../components/BulkEditModal';
import { StatusTransitionDialog } from '../components/StatusTransitionDialog';
import type { BoardCardAction } from '../components/AppointmentBoardCard';
import { useAppointmentBoard } from '../hooks/useAppointmentBoard';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { useBulkResendHandler } from '../hooks/useBulkResendHandler';
import { getAvailableTransitions } from '../lib/transitions';
import { DEFAULT_FILTERS } from '../types';
import type { Appointment } from '../types';

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

  // Service types are global (not tenant-scoped). Stable query key → cached,
  // never refetched on filter change. Same source as the list screen.
  const { options: serviceTypeApiOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'appointment-list-filter'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );
  const serviceTypeOptions = useMemo(
    () => [{ label: 'All', value: '' }, ...serviceTypeApiOptions],
    [serviceTypeApiOptions],
  );

  // Unlike the list, this route is AM/OP-only, so there is no CL branch of this
  // logic: branches are always derived from the loaded rows. AM/OP have no
  // tenant selector here, so /v1/branches cannot be called reliably
  // cross-tenant — same acknowledged limitation as the list screen, except the
  // board loads five columns so the dropdown ends up richer.
  const branchOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const apt of allItems) seen.set(apt.branchId, apt.branchName);
    return [
      { label: 'All', value: '' },
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [allItems]);

  const hasActiveFilters = useMemo(
    () =>
      (Object.keys(DEFAULT_FILTERS) as (keyof typeof DEFAULT_FILTERS)[]).some(
        (key) => filters[key] !== DEFAULT_FILTERS[key],
      ),
    [filters],
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
    setCancelTarget(null);
    clearSelection();
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

      if (isGlobalRole) {
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

  const bulkResend = useBulkResendHandler(selectedIds, clearSelection);

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
        hiddenFilters={['status', 'showCancelled']}
      />

      <InfoBanner className="mt-2">
        Draft appointments are not shown on the board.{' '}
        <Link to="/appointments" className="font-semibold underline">
          View them in the list
        </Link>
        .
      </InfoBanner>

      <div className={`mt-3 min-h-0 flex-1 overflow-x-auto ${selectedIds.length > 0 ? 'pb-16' : ''}`}>
        <div className="flex h-full gap-3">
          {columns.map((column) => (
            <AppointmentBoardColumn
              key={column.status}
              column={column}
              selectedIds={selectedIds}
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
          selectedCount={selectedIds.length}
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
        onConfirm={(reason, reasonCode) => cancelTransition.transition('CANCELLED', reason, reasonCode)}
        title="Cancel Appointment"
        message={`Cancel appointment ${cancelTarget?.code ?? ''}? This requires a reason.`}
        variant="danger"
        targetStatus="CANCELLED"
        loading={cancelTransition.isTransitioning}
      />

      <BulkEditModal
        selectedAppointments={allItems.filter((a) => selectedIds.includes(a.id))}
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
