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
      <FormSection title="Dados Pessoais">
        <DetailRow label="Nome" value={user.name} />
        <DetailRow label="E-mail" value={user.email} />
        <DetailRow label="Telefone" value={user.phone} />
      </FormSection>

      <FormSection title="Perfil">
        <DetailRow label="Perfil" value={<UserRoleChip role={user.role} />} />
        <DetailRow label="Status" value={<UserStatusChip status={user.status} />} />
        <DetailRow label="Filial" value={user.branchName} />
        <DetailRow label="Permissões" value={user.permissions.length > 0 ? user.permissions.join(', ') : null} />
      </FormSection>

      <FormSection title="Atividade">
        <DetailRow label="Último Acesso" value={user.lastLoginAt ? formatDateTimeBR(user.lastLoginAt) : null} />
        <DetailRow label="2FA" value={<BooleanIcon value={user.twoFactorEnabled} />} />
      </FormSection>

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(user.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(user.updatedAt)} />
      </FormSection>
    </div>
  );
}
