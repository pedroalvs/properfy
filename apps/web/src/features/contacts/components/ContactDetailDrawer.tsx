import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useContactDetail } from '../hooks/useContactDetail';
import { ContactTypeChip } from './ContactTypeChip';
import { ContactStatusBadge } from './ContactStatusBadge';
import { ContactDetailSections } from './ContactDetailSections';

interface ContactDetailDrawerProps {
  contactId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onDeactivate?: (id: string) => void;
  onReactivate?: (id: string) => void;
  canEdit?: boolean;
  canDeactivate?: boolean;
}

export function ContactDetailDrawer({
  contactId,
  open,
  onClose,
  onEdit,
  onDeactivate,
  onReactivate,
  canEdit = false,
  canDeactivate = false,
}: ContactDetailDrawerProps) {
  const navigate = useNavigate();
  const { contact, isLoading } = useContactDetail(contactId);

  const handleEdit = useCallback(() => {
    if (onEdit && contactId) onEdit(contactId);
  }, [onEdit, contactId]);

  const handleDeactivate = useCallback(() => {
    if (onDeactivate && contactId) onDeactivate(contactId);
  }, [onDeactivate, contactId]);

  const handleReactivate = useCallback(() => {
    if (onReactivate && contactId) onReactivate(contactId);
  }, [onReactivate, contactId]);

  const handleOpenFullDetail = useCallback(() => {
    if (contactId) {
      onClose();
      navigate(`/contacts/${contactId}`);
    }
  }, [contactId, onClose, navigate]);

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Loading..." onClose={onClose} />
            <div className="flex-1 px-6 py-4"><LoadingState rows={6} /></div>
          </>
        ) : contact ? (
          <>
            <DrawerHeader
              title={contact.displayName}
              onClose={onClose}
              actions={
                <>
                  <ContactTypeChip type={contact.type} />
                  <ContactStatusBadge isActive={contact.isActive} />
                  {contact.tenantId === null ? (
                    // 024 §FR-301 — surface the Standalone state so operators
                    // can tell apart cross-tenant contacts at a glance.
                    <span
                      className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs text-text-secondary"
                      title="Contact has no agency linkage; visibility derives from operational appointments."
                      aria-label="Standalone contact (no agency)"
                    >
                      Standalone
                    </span>
                  ) : null}
                  {canEdit && onEdit ? (
                    <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                      <i className="mdi mdi-pencil-outline text-xl" />
                    </Button>
                  ) : null}
                  {canDeactivate && contact.isActive && onDeactivate ? (
                    <Button variant="icon" onClick={handleDeactivate} aria-label="Deactivate">
                      <i className="mdi mdi-archive-outline text-xl" />
                    </Button>
                  ) : null}
                  {canDeactivate && !contact.isActive && onReactivate ? (
                    <Button variant="icon" onClick={handleReactivate} aria-label="Reactivate">
                      <i className="mdi mdi-restore text-xl" />
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ContactDetailSections contact={contact} />
              <div className="mt-4">
                <Button variant="outlined" onClick={handleOpenFullDetail} aria-label="Open full detail">
                  <i className="mdi mdi-open-in-new text-base" aria-hidden="true" />
                  Open full detail
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
