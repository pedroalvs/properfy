import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { StatusChip } from '@/components/ui/StatusChip';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAuth } from '@/hooks/useAuth';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { getAvailableTransitions } from '../lib/transitions';
import { AppointmentDetailSections } from '../components/AppointmentDetailSections';
import { AppointmentContactTab } from '../components/AppointmentContactTab';
import { AppointmentTimelineTab } from '../components/AppointmentTimelineTab';
import { AppointmentNotificationsTab } from '../components/AppointmentNotificationsTab';
import { AppointmentFinancialTab } from '../components/AppointmentFinancialTab';
import { AppointmentTransitionActions } from '../components/AppointmentTransitionActions';

const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
];

const NOTIFICATIONS_TAB = { id: 'notifications', label: 'Notifications' };
const TIMELINE_TAB = { id: 'timeline', label: 'Timeline' };
const FINANCIAL_TAB = { id: 'financial', label: 'Financial' };

function isPrivilegedRole(role: string): boolean {
  return role === 'AM' || role === 'OP';
}

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { appointment, isLoading, isError, refetch } = useAppointmentDetail(id ?? null);
  const { transition, isTransitioning } = useAppointmentTransition(id ?? null, refetch);
  const [activeTab, setActiveTab] = useState('overview');

  const isPrivileged = user ? isPrivilegedRole(user.role) : false;
  const tabs = [
    ...BASE_TABS,
    ...(isPrivileged ? [NOTIFICATIONS_TAB] : []),
    ...(isPrivileged ? [TIMELINE_TAB] : []),
    ...(isPrivileged ? [FINANCIAL_TAB] : []),
  ];

  const transitions =
    appointment && user
      ? getAvailableTransitions(appointment.status, user.role)
      : [];

  const handleEdit = useCallback(() => {
    navigate(`/appointments`);
  }, [navigate]);

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
          <h1 className="text-page-title text-secondary md:text-page-title mobile:text-page-title-mobile">
            {appointment.code}
          </h1>
          <StatusChip status={appointment.status} />
        </div>
        <button
          onClick={handleEdit}
          className="rounded p-2 text-text-secondary hover:bg-black/5"
          aria-label="Edit appointment"
        >
          <i className="mdi mdi-pencil-outline text-xl" aria-hidden="true" />
        </button>
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
    </div>
  );
}
