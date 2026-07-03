import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAuth } from '@/hooks/useAuth';
import { useGoBack } from '@/hooks/useGoBack';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
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
import { AppointmentEvidenceTab } from '../components/AppointmentEvidenceTab';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AssignInspectorModal } from '../components/AssignInspectorModal';
import { ForceConfirmDialog } from '../components/ForceConfirmDialog';
import { AppointmentPortalActivityTab } from '../components/AppointmentPortalActivityTab';
import { useDeleteAppointment } from '../hooks/useDeleteAppointment';
import { useForceConfirmation } from '../hooks/useForceConfirmation';

const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
];

const NOTIFICATIONS_TAB = { id: 'notifications', label: 'Notifications' };
const TIMELINE_TAB = { id: 'timeline', label: 'Timeline' };
const FINANCIAL_TAB = { id: 'financial', label: 'Financial' };
const EVIDENCE_TAB = { id: 'evidence', label: 'Evidence' };
const PORTAL_ACTIVITY_TAB = { id: 'portal-activity', label: 'Portal Activity' };
const CAN_EDIT_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];

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
  const { remove, isDeleting } = useDeleteAppointment(id ?? null, () => navigate('/appointments'));
  const { forceConfirm } = useForceConfirmation(id ?? null, refetch);

  const isPrivileged = user ? isPrivilegedRole(user.role) : false;
  const canEdit = user ? CAN_EDIT_ROLES.includes(user.role) : false;
  const { showSuccess, showError } = useSnackbar();
  const [isGeneratingPortalToken, setIsGeneratingPortalToken] = useState(false);
  const [isCopyingPortalLink, setIsCopyingPortalLink] = useState(false);
  const tabs = [
    ...BASE_TABS,
    ...(isPrivileged ? [PORTAL_ACTIVITY_TAB] : []),
    ...(isPrivileged ? [NOTIFICATIONS_TAB] : []),
    ...(isPrivileged ? [TIMELINE_TAB] : []),
    ...(isPrivileged ? [FINANCIAL_TAB] : []),
    ...(isPrivileged && appointment?.status === 'DONE' ? [EVIDENCE_TAB] : []),
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
  // Portal link is only meaningful once the appointment leaves DRAFT and is
  // not terminal — mirrors the backend INVALID_APPOINTMENT_STATUS gate.
  const canSendPortalLink = !!appointment &&
    isPrivileged &&
    (appointment.status === 'AWAITING_INSPECTOR' || appointment.status === 'SCHEDULED') &&
    (!!appointment.contactEmail || !!appointment.contactPhone);
  const canCopyPortalLink = !!appointment && isPrivileged;
  const canDelete = !!appointment && user?.role === 'AM' && appointment.status === 'DRAFT';
  const canForceConfirm = !!appointment &&
    isPrivileged &&
    appointment.rentalTenantConfirmationStatus !== 'CONFIRMED' &&
    appointment.status !== 'DONE' &&
    appointment.status !== 'CANCELLED' &&
    appointment.status !== 'REJECTED';

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
        const err = error as { error?: { message?: string } };
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

  const handleCopyPortalLink = useCallback(async () => {
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
      showSuccess('Portal link copied to clipboard');
    } catch {
      showError('Failed to copy portal link');
    } finally {
      setIsCopyingPortalLink(false);
    }
  }, [appointment, showSuccess, showError]);

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
            <Button
              variant="secondary"
              onClick={handleGeneratePortalToken}
              loading={isGeneratingPortalToken}
              data-testid="send-portal-link-button"
            >
              <i className="mdi mdi-link-variant text-base" aria-hidden="true" />
              Send Portal Link
            </Button>
          )}
          {canCopyPortalLink && (
            <span
              title={!appointment.hasActivePortalToken ? 'No active portal link — send one first' : undefined}
            >
              <Button
                variant="secondary"
                onClick={handleCopyPortalLink}
                loading={isCopyingPortalLink}
                disabled={!appointment.hasActivePortalToken}
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
            <AppointmentDetailSections appointment={appointment} />
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
          {activeTab === 'evidence' && isPrivileged && (
            <AppointmentEvidenceTab appointmentId={appointment.id} />
          )}
          {activeTab === 'portal-activity' && isPrivileged && (
            <AppointmentPortalActivityTab appointmentId={appointment.id} />
          )}
        </div>

        {transitions.length > 0 && (
          <div className="border-t border-black/10 px-6 py-4">
            <AppointmentTransitionActions
              transitions={transitions}
              onTransition={transition}
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
      <ForceConfirmDialog
        open={forceConfirmOpen}
        onClose={() => setForceConfirmOpen(false)}
        onConfirm={(reason) => {
          forceConfirm(reason);
          setForceConfirmOpen(false);
        }}
      />
    </div>
  );
}
