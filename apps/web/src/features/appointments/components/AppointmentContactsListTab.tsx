import { useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { TenantConfirmationChip } from './TenantConfirmationChip';
import { ContactDetailDrawer } from './ContactDetailDrawer';
import { useAppointmentContacts } from '../hooks/useAppointmentContacts';

interface AppointmentContactsListTabProps {
  tenantId: string;
}

export function AppointmentContactsListTab({ tenantId }: AppointmentContactsListTabProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const { contacts, isLoading, isError, refetch } = useAppointmentContacts(tenantId);

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  if (isError) {
    return <ErrorState message="Failed to load contacts" onRetry={refetch} />;
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        title="No contacts"
        description="No appointment contacts found."
        icon="mdi-account-group-outline"
      />
    );
  }

  return (
    <>
      <div className="divide-y divide-black/5">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => setSelectedContactId(contact.id)}
            className="flex w-full items-center justify-between gap-3 rounded px-2 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-sm font-semibold text-secondary">{contact.name}</span>
              <span className="truncate text-sm text-text-secondary">{contact.propertyAddress}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <TenantConfirmationChip status={contact.confirmationStatus as any} />
              <i className="mdi mdi-chevron-right text-lg text-text-muted" aria-hidden="true" />
            </div>
          </button>
        ))}
      </div>
      <ContactDetailDrawer
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
      />
    </>
  );
}
