import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { UserRoleChip } from './UserRoleChip';
import { UserStatusChip } from './UserStatusChip';
import type { UserDetail } from '../types';

interface UserDetailSectionsProps {
  user: UserDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function UserDetailSections({ user }: UserDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Personal Details">
        <DetailRow label="Name" value={user.name} />
        <DetailRow label="Email" value={user.email} />
        <DetailRow label="Phone" value={user.phone} />
      </FormSection>

      <FormSection title="Profile">
        <DetailRow label="Role" value={<UserRoleChip role={user.role} />} />
        <DetailRow label="Status" value={<UserStatusChip status={user.status} />} />
        <DetailRow label="Branch" value={user.branchName} />
        <DetailRow label="Permissions" value={user.permissions.length > 0 ? user.permissions.join(', ') : null} />
      </FormSection>

      <FormSection title="Activity">
        <DetailRow label="Last Login" value={user.lastLoginAt ? formatDateTimeBR(user.lastLoginAt) : null} />
        <DetailRow label="2FA" value={<BooleanIcon value={user.twoFactorEnabled} />} />
      </FormSection>

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTimeBR(user.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTimeBR(user.updatedAt)} />
      </FormSection>
    </div>
  );
}
