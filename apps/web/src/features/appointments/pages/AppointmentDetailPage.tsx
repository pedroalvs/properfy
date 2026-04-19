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
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentCrossCheck } from '../hooks/useAppointmentCrossCheck';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { getAvailableTransitions } from '../lib/transitions';
import { isAppointmentEditable } from '../lib/editability';
import { AppointmentDetailSections } from '../components/AppointmentDetailSections';
import { AppointmentContactTab } from '../components/AppointmentContactTab';
import { AppointmentTimelineTab } from '../components/AppointmentTimelineTab';
import { AppointmentNotificationsTab } from '../components/AppointmentNotificationsTab';
import { AppointmentFinancialTab } from '../components/AppointmentFinancialTab';
import { AppointmentTransitionActions } from '../components/AppointmentTransitionActions';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AssignInspectorModal } from '../components/AssignInspectorModal';

const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
];

const NOTIFICATIONS_TAB = { id: 'notifications', label: 'Notifications' };
const TIMELINE_TAB = { id: 'timeline', label: 'Timeline' };
const FINANCIAL_TAB = { id: 'financial', label: 'Financial' };
const CAN_EDIT_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];

function isPrivilegedRole(role: string): boolean {
  return role === 'AM' || role === 'OP';
}

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { appointment, isLoading, isError, refetch } = useAppointmentDetail(id ?? null);
  const { crossCheckDone, isCrossChecking } = useAppointmentCrossCheck(id ?? null, refetch);
  const { transition, isTransitioning } = useAppointmentTransition(id ?? null, refetch);
  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmCrossCheckOpen, setConfirmCrossCheckOpen] = useState(false);
  const [assignInspectorOpen, setAssignInspectorOpen] = useState(false);

  const isPrivileged = user ? isPrivilegedRole(user.role) : false;
  const canEdit = user ? CAN_EDIT_ROLES.includes(user.role) : false;
  const { showSuccess, showError } = useSnackbar();
  const [isGeneratingPortalToken, setIsGeneratingPortalToken] = useState(false);
  const tabs = [
    ...BASE_TABS,
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
  const canEditAppointment = canEdit && !!appointment && isAppointmentEditable(appointment.status);
  const canCrossCheckDone = !!appointment &&
    isPrivileged &&
    appointment.status === 'DONE' &&
    !appointment.doneCheckedByUserId;
  const canAssignInspector = !!appointment &&
    (appointment.status === 'AWAITING_INSPECTOR' || appointment.status === 'DRAFT') &&
    !appointment.inspectorId &&
    (user?.role === 'OP' || user?.role === 'AM');
  const canSendPortalLink = !!appointment &&
    isPrivileged &&
    appointment.status !== 'DONE' &&
    appointment.status !== 'CANCELLED' &&
    appointment.status !== 'REJECTED' &&
    (!!appointment.contactEmail || !!appointment.contactPhone);

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
        showError(err?.error?.message ?? 'Failed to generate portal link');
        return;
      }
      const token = (data as { token?: string })?.token;
      if (token) {
        const url = `${window.location.origin}/tenant-portal/${token}`;
        try {
          await navigator.clipboard.writeText(url);
          showSuccess('Portal link generated and copied to clipboard');
        } catch {
          showSuccess(`Portal link generated: ${url}`);
        }
      } else {
        showSuccess('Portal link generated');
      }
    } catch {
      showError('Failed to generate portal link');
    } finally {
      setIsGeneratingPortalToken(false);
    }
  }, [appointment, showSuccess, showError]);

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Loading..."
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: () => navigate(-1) },
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
            { label: 'Back', icon: 'mdi-arrow-left', onClick: () => navigate(-1) },
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
            onClick={() => navigate(-1)}
            className="rounded p-1 text-text-secondary hover:bg-black/5"
            aria-label="Go back"
          >
            <i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />
          </button>
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {appointment.code}
            <span className="ml-2 text-base font-normal text-text-muted">#{appointment.appointmentNumber}</span>
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
          {canEditAppointment && (
            <button
              onClick={handleEdit}
              className="rounded p-2 text-text-secondary hover:bg-black/5"
              aria-label="Edit appointment"
            >
              <i className="mdi mdi-pencil-outline text-xl" aria-hidden="true" />
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
    </div>
  );
}
