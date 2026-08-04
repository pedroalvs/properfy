import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AppointmentStatus,
  UserRole,
  TENANT_NOTIFICATIONS_BLOCKED_CODE,
  suppressesOccupantNotifications,
} from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { FlowTypeChip } from '@/features/service-types/components/FlowTypeChip';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useGoBack } from '@/hooks/useGoBack';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { wasRentalTenantNotified } from '../lib/rental-tenant-notice';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentCrossCheck } from '../hooks/useAppointmentCrossCheck';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { getAvailableTransitions } from '../lib/transitions';
import { isAppointmentScheduleEditable } from '../lib/editability';
import { AppointmentDetailSections } from '../components/AppointmentDetailSections';
import { AppointmentContactTab } from '../components/AppointmentContactTab';
import { AppointmentTimelineTab } from '../components/AppointmentTimelineTab';
import { AppointmentNotificationsTab } from '../components/AppointmentNotificationsTab';
import { AppointmentFinancialTab } from '../components/AppointmentFinancialTab';
import { AppointmentTransitionActions } from '../components/AppointmentTransitionActions';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AssignInspectorModal } from '../components/AssignInspectorModal';
import { ForceConfirmDialog } from '../components/ForceConfirmDialog';
import { TenantAvailabilityDialog } from '../components/TenantAvailabilityDialog';
import { AppointmentPortalActivityTab } from '../components/AppointmentPortalActivityTab';
import { AppointmentSatisfactionSection } from '../components/AppointmentSatisfactionSection';
import { useDeleteAppointment } from '../hooks/useDeleteAppointment';
import { useForceConfirmation } from '../hooks/useForceConfirmation';

const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
];

const NOTIFICATIONS_TAB = { id: 'notifications', label: 'Notifications' };
const TIMELINE_TAB = { id: 'timeline', label: 'Timeline' };
const FINANCIAL_TAB = { id: 'financial', label: 'Financial' };
const PORTAL_ACTIVITY_TAB = { id: 'portal-activity', label: 'Portal Activity' };
const CAN_EDIT_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];

/** Shown on the disabled "Send Portal Link" button and on the 409 that backs it. */
const TENANT_NOTIFICATIONS_BLOCKED_HINT =
  'Notifications to the tenant are blocked for this agency. Use Copy Portal Link to send it yourself.';
const MISSING_PRIMARY_CONTACT_HINT =
  'No primary contact email or phone is available for this appointment. Use Copy Portal Link to send it yourself.';
const NO_OCCUPANT_HINT =
  'Ingoing and outgoing inspections have no tenant to notify — being scheduled is already the confirmation.';

function isPrivilegedRole(role: string): boolean {
  return role === 'AM' || role === 'OP';
}

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const handleBack = useGoBack('/appointments');
  const { user } = useAuth();
  const { appointment, isLoading, isError, refetch } = useAppointmentDetail(id ?? null);
  const { crossCheckDone, isCrossChecking } = useAppointmentCrossCheck(id ?? null, refetch);
  const { transition, isTransitioning } = useAppointmentTransition(id ?? null, refetch);
  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmCrossCheckOpen, setConfirmCrossCheckOpen] = useState(false);
  const [assignInspectorOpen, setAssignInspectorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);
  const [tenantAvailabilityOpen, setTenantAvailabilityOpen] = useState(false);
  const { remove, isDeleting } = useDeleteAppointment(id ?? null, () => navigate('/appointments'));
  const { forceConfirm } = useForceConfirmation(id ?? null, refetch);

  const isPrivileged = user ? isPrivilegedRole(user.role) : false;
  const canEdit = user ? CAN_EDIT_ROLES.includes(user.role) : false;
  // Agency-facing surfaces read the shared role matrix instead of `isPrivileged`,
  // so CL_ADMIN reaches them without inheriting the operations-only actions.
  const { canPerform, hasClUserFlag } = usePermissions();
  const canUsePortalLink = canPerform('appointment.portal_link');
  const canViewPortalActivity = canPerform('appointment.portal_activity');
  const { showSuccess, showError } = useSnackbar();
  const [isGeneratingPortalToken, setIsGeneratingPortalToken] = useState(false);
  const [isCopyingPortalLink, setIsCopyingPortalLink] = useState(false);
  const [generateAndCopyOpen, setGenerateAndCopyOpen] = useState(false);
  const tabs = [
    ...BASE_TABS,
    ...(canViewPortalActivity ? [PORTAL_ACTIVITY_TAB] : []),
    ...(isPrivileged ? [NOTIFICATIONS_TAB] : []),
    ...(isPrivileged ? [TIMELINE_TAB] : []),
    ...(isPrivileged ? [FINANCIAL_TAB] : []),
  ];

  const rawTransitions =
    appointment && user
      ? getAvailableTransitions(appointment.status, user.role)
      : [];
  // SCHEDULED requires an inspector — hide that transition when none is assigned;
  // the "Assign Inspector" button handles this case instead.
  const transitions = appointment?.inspectorId
    ? rawTransitions
    : rawTransitions.filter((t) => t.targetStatus !== 'SCHEDULED');
  const canEditAppointment = canEdit && !!appointment && isAppointmentScheduleEditable(appointment.status);
  const canCrossCheckDone = !!appointment &&
    isPrivileged &&
    appointment.status === 'DONE' &&
    !appointment.doneCheckedByUserId;
  const canAssignInspector = !!appointment &&
    appointment.status === 'AWAITING_INSPECTOR' &&
    !appointment.inspectorId &&
    (user?.role === 'OP' || user?.role === 'AM');
  // The owning agency contacts its own tenants, so the platform must not. The button
  // stays VISIBLE but disabled: an action that silently vanishes reads as a missing
  // feature, whereas a disabled one with a reason explains itself. Copy Portal Link
  // is deliberately left enabled — it dispatches nothing.
  // `=== false` and not the shared isRentalTenantNotificationsEnabled predicate: that one
  // takes a settings blob, whereas the API already resolved the tri-state into an optional
  // boolean here. Absent still means enabled.
  const tenantNotificationsBlocked = appointment?.rentalTenantNotificationsEnabled === false;
  const hasPrimaryContact = !!appointment?.contactEmail || !!appointment?.contactPhone;
  // INGOING/OUTGOING have no occupant at all, so this outranks both the agency
  // policy ("we contact them ourselves") and the missing-contact hint: those
  // describe an occupant we cannot reach, this one says there is none.
  const hasNoOccupant = suppressesOccupantNotifications(appointment?.flowType);
  const sendPortalLinkDisabledHint = hasNoOccupant
    ? NO_OCCUPANT_HINT
    : tenantNotificationsBlocked
      ? TENANT_NOTIFICATIONS_BLOCKED_HINT
      : !hasPrimaryContact
        ? MISSING_PRIMARY_CONTACT_HINT
        : undefined;
  // Portal link is only meaningful once the appointment leaves DRAFT and is
  // not terminal — mirrors the backend INVALID_APPOINTMENT_STATUS gate.
  const canSendPortalLink = !!appointment &&
    canUsePortalLink &&
    (appointment.status === 'AWAITING_INSPECTOR' || appointment.status === 'SCHEDULED');
  const canCopyPortalLink = !!appointment && canUsePortalLink;
  // Generate-only (no notification) follows the same backend status gate as Send,
  // but needs no contact — nothing is dispatched.
  const canGeneratePortalToken = !!appointment &&
    canUsePortalLink &&
    (appointment.status === 'AWAITING_INSPECTOR' || appointment.status === 'SCHEDULED');
  const canDelete = !!appointment && user?.role === 'AM' && appointment.status === 'DRAFT';
  // `hasClUserFlag` is unconditional for every role except CL_USER, mirroring the
  // server-side `assertClUserPermission` — so this reads as AM/OP/CL_ADMIN plus
  // CL_USER holding the flag.
  const canForceConfirm = !!appointment &&
    canPerform('appointment.force_confirmation') &&
    hasClUserFlag('force_confirmation') &&
    // Forcing a confirmation stands in for an occupant who did not reply. With
    // no occupant there is nothing to stand in for — SCHEDULED already is the
    // confirmation for these flows.
    !hasNoOccupant &&
    appointment.rentalTenantConfirmationStatus !== 'CONFIRMED' &&
    appointment.status !== 'DONE' &&
    appointment.status !== 'CANCELLED' &&
    appointment.status !== 'REJECTED';

  // Recording what the tenant said is data entry, so the agency admin may do it
  // too. Declining on their behalf is not: every `→ REJECTED` edge in the state
  // machine admits only AM/OP/SYS, so the checkbox is gated separately below.
  // Same gate as force-confirmation: recording the availability an occupant
  // offered, or marking them unavailable, is recording an answer nobody gave
  // when the service type has no occupant in the first place.
  const canSetTenantAvailability = !!appointment &&
    !hasNoOccupant &&
    (isPrivileged || user?.role === UserRole.CL_ADMIN);
  const canMarkTenantUnavailable = !!appointment && isPrivileged && !hasNoOccupant && (
    appointment.status === AppointmentStatus.AWAITING_INSPECTOR
    || appointment.status === AppointmentStatus.SCHEDULED
  );
  const tenantAvailability = appointment?.rentalTenantAvailableSlots;

  const handleEdit = useCallback(() => {
    if (!canEditAppointment) {
      return;
    }
    setEditOpen(true);
  }, [canEditAppointment]);

  const handleGeneratePortalToken = useCallback(async () => {
    if (!appointment) return;
    setIsGeneratingPortalToken(true);
    try {
      const { data, error } = await api.POST(
        `/v1/appointments/${appointment.id}/portal-token` as never,
        {} as never,
      );
      if (error) {
        const err = error as { error?: { message?: string; code?: string } };
        // Defence in depth: the button is disabled for a blocked agency, but a page
        // left open while an AM flips the setting would still get here.
        if (err?.error?.code === TENANT_NOTIFICATIONS_BLOCKED_CODE) {
          showError(TENANT_NOTIFICATIONS_BLOCKED_HINT);
          refetch();
          return;
        }
        showError(err?.error?.message ?? 'Failed to send portal link');
        return;
      }
      // The token is always minted, but the notification may have been
      // skipped/failed — never claim "Email sent" unless it was dispatched.
      const result = (data as { data?: { dispatched?: boolean; reason?: string } })?.data;
      if (result?.dispatched === false) {
        if (result.reason === 'NO_PRIMARY_CONTACT') {
          showError('Portal link generated, but no email sent — appointment has no primary contact');
        } else {
          showError('Portal link generated, but the email could not be sent — check the Notifications tab');
        }
      } else {
        showSuccess('Email sent to tenant');
      }
      refetch();
    } catch {
      showError('Failed to send portal link');
    } finally {
      setIsGeneratingPortalToken(false);
    }
  }, [appointment, showSuccess, showError, refetch]);

  // Copies the current active portal link to the clipboard. `successMessage`
  // lets the generate-and-copy flow make clear nothing was sent to the tenant.
  const copyPortalLink = useCallback(async (successMessage: string) => {
    if (!appointment) return;
    setIsCopyingPortalLink(true);
    try {
      const { data, error, response } = await api.GET(
        `/v1/appointments/${appointment.id}/portal-link` as never,
        {} as never,
      );
      if (response?.status === 409) {
        showError('Send Portal Link to generate a fresh link');
        return;
      }
      if (error) {
        const err = error as { error?: { message?: string } };
        showError(err?.error?.message ?? 'Failed to copy portal link');
        return;
      }
      const url = (data as { data: { portalUrl: string } })?.data?.portalUrl;
      if (!url) {
        showError('Portal link not available');
        return;
      }
      await navigator.clipboard.writeText(url);
      showSuccess(successMessage);
    } catch {
      showError('Failed to copy portal link');
    } finally {
      setIsCopyingPortalLink(false);
    }
  }, [appointment, showSuccess, showError]);

  const handleCopyPortalLink = useCallback(() => {
    void copyPortalLink('Portal link copied to clipboard');
  }, [copyPortalLink]);

  // Generate-only: mint a token without notifying the tenant, then copy the link.
  const handleGenerateAndCopy = useCallback(async () => {
    if (!appointment) return;
    setGenerateAndCopyOpen(false);
    setIsGeneratingPortalToken(true);
    try {
      const { error } = await api.POST(
        `/v1/appointments/${appointment.id}/portal-token` as never,
        { body: { notify: false } } as never,
      );
      if (error) {
        const err = error as { error?: { message?: string } };
        showError(err?.error?.message ?? 'Failed to generate portal link');
        return;
      }
      await copyPortalLink('Portal link generated and copied — not sent to tenant');
      refetch();
    } catch {
      showError('Failed to generate portal link');
    } finally {
      setIsGeneratingPortalToken(false);
    }
  }, [appointment, copyPortalLink, showError, refetch]);

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Loading..."
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: handleBack },
          ]}
        />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <LoadingState rows={8} />
        </div>
      </div>
    );
  }

  if (isError || !appointment) {
    return (
      <div>
        <PageHeader
          title="Appointment"
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: handleBack },
          ]}
        />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <ErrorState
            message="Failed to load appointment details"
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="rounded p-1 text-text-secondary hover:bg-black/5"
            aria-label="Go back"
          >
            <i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />
          </button>
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {appointment.appointmentCode}
          </h1>
          <AppointmentStatusChip status={appointment.status} doneCheckedByUserId={appointment.doneCheckedByUserId} isOverdue={appointment.isOverdue} />
          {/* Rendered beside the status so the operator can see WHY the
              occupant-facing actions below are unavailable. */}
          {appointment.flowType && <FlowTypeChip flowType={appointment.flowType} />}
        </div>
        <div className="flex items-center gap-2">
          {canAssignInspector && (
            <Button
              variant="primary"
              onClick={() => setAssignInspectorOpen(true)}
              data-testid="assign-inspector-button"
            >
              <i className="mdi mdi-account-check text-base" aria-hidden="true" />
              Assign Inspector
            </Button>
          )}
          {canSendPortalLink && (
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="secondary"
                onClick={handleGeneratePortalToken}
                loading={isGeneratingPortalToken}
                disabled={!!sendPortalLinkDisabledHint}
                aria-describedby={
                  sendPortalLinkDisabledHint ? 'send-portal-link-disabled-hint' : undefined
                }
                data-testid="send-portal-link-button"
              >
                <i className="mdi mdi-link-variant text-base" aria-hidden="true" />
                Send Portal Link
              </Button>
              {sendPortalLinkDisabledHint && (
                // Native disabled controls cannot receive focus, so the explanation
                // must remain visibly available rather than relying on a tooltip.
                <span id="send-portal-link-disabled-hint" className="max-w-xs text-xs text-text-secondary">
                  {sendPortalLinkDisabledHint}
                </span>
              )}
            </div>
          )}
          {canCopyPortalLink && (
            <span
              title={
                !appointment.hasActivePortalToken && !canGeneratePortalToken
                  ? 'No active portal link — send one first'
                  : undefined
              }
            >
              <Button
                variant="secondary"
                onClick={
                  appointment.hasActivePortalToken
                    ? handleCopyPortalLink
                    : () => setGenerateAndCopyOpen(true)
                }
                loading={isCopyingPortalLink || isGeneratingPortalToken}
                disabled={!appointment.hasActivePortalToken && !canGeneratePortalToken}
                data-testid="copy-portal-link-button"
              >
                <i className="mdi mdi-content-copy text-base" aria-hidden="true" />
                Copy Portal Link
              </Button>
            </span>
          )}
          {canCrossCheckDone && (
            <Button
              variant="primary"
              onClick={() => setConfirmCrossCheckOpen(true)}
              loading={isCrossChecking}
            >
              <i className="mdi mdi-check-decagram text-base" aria-hidden="true" />
              Confirm Done
            </Button>
          )}
          {canForceConfirm && (
            <Button
              variant="outlined"
              onClick={() => setForceConfirmOpen(true)}
            >
              <i className="mdi mdi-account-check text-base" aria-hidden="true" />
              Force Confirm
            </Button>
          )}
          {canSetTenantAvailability && (
            <Button
              variant="outlined"
              onClick={() => setTenantAvailabilityOpen(true)}
              data-testid="set-tenant-availability-button"
            >
              <i className="mdi mdi-calendar-clock text-base" aria-hidden="true" />
              Tenant Availability
            </Button>
          )}
          {canEditAppointment && (
            <button
              onClick={handleEdit}
              className="rounded p-2 text-text-secondary hover:bg-black/5"
              aria-label="Edit appointment"
            >
              <i className="mdi mdi-pencil-outline text-xl" aria-hidden="true" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="rounded p-2 text-error hover:bg-error/5"
              aria-label="Delete appointment"
            >
              <i className="mdi mdi-delete-outline text-xl" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded bg-card-bg shadow-sm">
        <TabsNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === 'overview' && (
            <>
              <AppointmentDetailSections appointment={appointment} />
              <AppointmentSatisfactionSection
                appointmentId={appointment.id}
                isDone={appointment.status === 'DONE'}
              />
            </>
          )}
          {activeTab === 'contact' && (
            <AppointmentContactTab appointment={appointment} />
          )}
          {activeTab === 'timeline' && isPrivileged && (
            <AppointmentTimelineTab appointmentId={appointment.id} />
          )}
          {activeTab === 'notifications' && isPrivileged && (
            <AppointmentNotificationsTab appointmentId={appointment.id} />
          )}
          {activeTab === 'financial' && isPrivileged && (
            <AppointmentFinancialTab appointmentId={appointment.id} />
          )}
          {activeTab === 'portal-activity' && canViewPortalActivity && (
            <AppointmentPortalActivityTab appointmentId={appointment.id} />
          )}
        </div>

        {transitions.length > 0 && (
          <div className="border-t border-black/10 px-6 py-4">
            <AppointmentTransitionActions
              transitions={transitions}
              onTransition={transition}
              rentalTenantNotified={wasRentalTenantNotified(appointment)}
              loading={isTransitioning}
            />
          </div>
        )}
      </div>

      <AppointmentFormDrawer
        open={editOpen}
        appointmentId={appointment.id}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          refetch();
        }}
      />
      {canAssignInspector && (
        <AssignInspectorModal
          open={assignInspectorOpen}
          appointmentId={appointment.id}
          onClose={() => setAssignInspectorOpen(false)}
          onSuccess={() => {
            setAssignInspectorOpen(false);
            refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmCrossCheckOpen}
        onClose={() => setConfirmCrossCheckOpen(false)}
        onConfirm={() => {
          crossCheckDone();
          setConfirmCrossCheckOpen(false);
        }}
        title="Confirm Done"
        message="Confirm that the field completion is valid and release this appointment for financial processing?"
        confirmLabel="Confirm Done"
        variant="warning"
        loading={isCrossChecking}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          remove();
          setDeleteOpen(false);
        }}
        title="Delete Appointment"
        message="This will permanently delete this draft appointment. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={isDeleting}
      />
      <ConfirmDialog
        open={generateAndCopyOpen}
        onClose={() => setGenerateAndCopyOpen(false)}
        onConfirm={() => {
          void handleGenerateAndCopy();
        }}
        title="Generate Portal Link"
        message="This will generate a portal link that will NOT be sent to the tenant. Generate and copy?"
        confirmLabel="Generate & Copy"
        variant="warning"
        loading={isGeneratingPortalToken}
      />
      <ForceConfirmDialog
        open={forceConfirmOpen}
        onClose={() => setForceConfirmOpen(false)}
        onConfirm={(reason) => {
          forceConfirm(reason);
          setForceConfirmOpen(false);
        }}
      />
      {appointment && (
        <TenantAvailabilityDialog
          open={tenantAvailabilityOpen}
          appointmentId={appointment.id}
          slots={tenantAvailability}
          canMarkUnavailable={canMarkTenantUnavailable}
          onClose={() => setTenantAvailabilityOpen(false)}
          onSaved={() => {
            setTenantAvailabilityOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
