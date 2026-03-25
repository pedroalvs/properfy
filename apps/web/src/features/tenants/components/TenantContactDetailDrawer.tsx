import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useTenantContactDetail } from '../hooks/useTenantContactDetail';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';
import { TenantContactDetailSections } from './TenantContactDetailSections';

interface TenantContactDetailDrawerProps {
  contactId: string | null;
  open: boolean;
  onClose: () => void;
}

export function TenantContactDetailDrawer({ contactId, open, onClose }: TenantContactDetailDrawerProps) {
  const { contact, isLoading } = useTenantContactDetail(contactId);

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Loading..." onClose={onClose} />
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          </>
        ) : contact ? (
          <>
            <DrawerHeader
              title={contact.name}
              onClose={onClose}
              actions={<TenantConfirmationStatusChip status={contact.confirmationStatus} />}
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TenantContactDetailSections contact={contact} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
