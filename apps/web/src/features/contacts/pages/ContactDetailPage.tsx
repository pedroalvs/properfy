import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { usePermissions } from '@/hooks/usePermissions';
import { useContactDetail } from '../hooks/useContactDetail';
import { useContactDeactivate } from '../hooks/useContactDeactivate';
import { ContactTypeChip } from '../components/ContactTypeChip';
import { ContactStatusBadge } from '../components/ContactStatusBadge';
import { ContactDetailSections } from '../components/ContactDetailSections';
import { ContactPropertiesTab } from '../components/ContactPropertiesTab';
import { ContactAppointmentsTab } from '../components/ContactAppointmentsTab';
import { ContactTimelineTab } from '../components/ContactTimelineTab';
import { ContactFormDrawer } from '../components/ContactFormDrawer';
import { DeactivateContactModal } from '../components/DeactivateContactModal';

type TabId = 'overview' | 'properties' | 'appointments' | 'timeline';

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { canPerform } = usePermissions();
  const { contact, isLoading, isError, refetch } = useContactDetail(id ?? null);
  const { deactivate, reactivate, isPending: isDeactivating } = useContactDeactivate();
  const canEdit = canPerform('contact.update');
  const canDeactivate = canPerform('contact.deactivate');
  const canViewAudit = canPerform('audit.view');

  const allTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'properties', label: 'Properties' },
    { id: 'appointments', label: 'Appointments' },
    ...(canViewAudit ? [{ id: 'timeline', label: 'Timeline' }] : []),
  ];

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  const handleDeactivate = useCallback(async () => {
    if (!id) return;
    const result = await deactivate(id);
    if (result.success) {
      showSuccess('Contact deactivated');
      setShowDeactivate(false);
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to deactivate contact');
    }
  }, [id, deactivate, refetch, showSuccess, showError]);

  const handleReactivate = useCallback(async () => {
    if (!id) return;
    const result = await reactivate(id);
    if (result.success) {
      showSuccess('Contact reactivated');
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to reactivate contact');
    }
  }, [id, reactivate, refetch, showSuccess, showError]);

  if (isLoading) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <LoadingState rows={8} />
      </div>
    );
  }

  if (isError || !contact || !id) {
    return (
      <div className="px-8 py-6">
        <EmptyState
          title="Contact not found"
          description="This contact does not exist or you do not have permission to view it."
          action={{ label: 'Back to Contacts', onClick: () => navigate('/contacts') }}
        />
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
            {contact.displayName}
          </h1>
          <ContactTypeChip type={contact.type} />
          <ContactStatusBadge isActive={contact.isActive} />
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="outlined" onClick={() => setFormOpen(true)} aria-label="Edit contact">
              <i className="mdi mdi-pencil-outline text-base" aria-hidden="true" /> Edit
            </Button>
          ) : null}
          {canDeactivate && contact.isActive ? (
            <Button variant="outlined" onClick={() => setShowDeactivate(true)} aria-label="Deactivate contact">
              <i className="mdi mdi-archive-outline text-base" aria-hidden="true" /> Deactivate
            </Button>
          ) : null}
          {canDeactivate && !contact.isActive ? (
            <Button variant="outlined" onClick={handleReactivate} aria-label="Reactivate contact">
              <i className="mdi mdi-restore text-base" aria-hidden="true" /> Reactivate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded bg-card-bg shadow-sm">
        <TabsNav
          tabs={allTabs}
          activeTab={activeTab}
          onChange={(t) => setActiveTab(t as TabId)}
        />
        <div className="p-6">
          {activeTab === 'overview' && <ContactDetailSections contact={contact} />}
          {activeTab === 'properties' && (
            <ContactPropertiesTab contactId={id} enabled={activeTab === 'properties'} />
          )}
          {activeTab === 'appointments' && (
            <ContactAppointmentsTab contactId={id} enabled={activeTab === 'appointments'} />
          )}
          {activeTab === 'timeline' && canViewAudit && (
            <ContactTimelineTab contactId={id} enabled={activeTab === 'timeline'} />
          )}
        </div>
      </div>

      <ContactFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        contactId={id}
        onSaved={() => {
          setFormOpen(false);
          refetch();
        }}
      />
      <DeactivateContactModal
        open={showDeactivate}
        contactName={contact.displayName}
        loading={isDeactivating}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
