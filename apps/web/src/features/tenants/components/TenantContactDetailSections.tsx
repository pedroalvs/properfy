import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';
import type { TenantContactDetail } from '../types';

interface TenantContactDetailSectionsProps {
  contact: TenantContactDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function TenantContactDetailSections({ contact }: TenantContactDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Contato">
        <DetailRow label="Nome" value={contact.name} />
        <DetailRow label="E-mail" value={contact.primaryEmail} />
        <DetailRow label="Telefone" value={contact.primaryPhone} />
        <DetailRow label="Telefone Alternativo" value={contact.alternativePhone} />
      </FormSection>

      <FormSection title="Vistoria">
        <DetailRow label="Código" value={contact.appointmentCode} />
        <DetailRow label="Endereço" value={contact.propertyAddress} />
        <DetailRow label="Data da Vistoria" value={formatDateTimeBR(contact.appointmentDate)} />
      </FormSection>

      <FormSection title="Confirmação">
        <DetailRow label="Status" value={<TenantConfirmationStatusChip status={contact.confirmationStatus} />} />
        <DetailRow label="Última Atividade" value={contact.lastActivityAt ? formatDateTimeBR(contact.lastActivityAt) : null} />
      </FormSection>

      {contact.notes && (
        <FormSection title="Observações">
          <DetailRow label="Notas" value={contact.notes} />
        </FormSection>
      )}

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(contact.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(contact.updatedAt)} />
      </FormSection>
    </div>
  );
}
