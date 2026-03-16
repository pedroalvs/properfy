import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import type { AppointmentDetail } from '../types';

interface AppointmentDetailSectionsProps {
  appointment: AppointmentDetail;
}

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function AppointmentDetailSections({ appointment }: AppointmentDetailSectionsProps) {
  const confirmationStyle = TENANT_CONFIRMATION_STATUS_MAP[appointment.tenantConfirmationStatus];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Dados da Vistoria">
        <DetailRow label="Tipo de Serviço" value={appointment.serviceTypeName} />
        <DetailRow label="Endereço" value={appointment.propertyAddress} />
        <DetailRow label="Filial" value={appointment.branchName} />
        <DetailRow label="Data Agendada" value={formatDateBR(appointment.scheduledDate)} />
        <DetailRow label="Horário" value={appointment.timeSlot} />
        <DetailRow label="Inspetor" value={appointment.inspectorName} />
      </FormSection>

      <FormSection title="Contato">
        <DetailRow label="Nome" value={appointment.contactName} />
        <DetailRow label="Telefone" value={appointment.contactPhone} />
        <DetailRow label="Email" value={appointment.contactEmail} />
      </FormSection>

      <FormSection title="Acesso">
        <DetailRow
          label="Chave Necessária"
          value={<BooleanIcon value={appointment.keyRequired} />}
        />
        <DetailRow label="Ponto de Encontro" value={appointment.meetingLocation} />
        <DetailRow label="Local da Chave" value={appointment.keyLocation} />
      </FormSection>

      <FormSection title="Confirmação do Inquilino">
        <DetailRow
          label="Status"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: confirmationStyle.bg, color: confirmationStyle.text }}
            >
              {confirmationStyle.label}
            </span>
          }
        />
      </FormSection>

      {appointment.notes && (
        <FormSection title="Observações">
          <DetailRow label="Notas" value={appointment.notes} />
        </FormSection>
      )}

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(appointment.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(appointment.updatedAt)} />
        {appointment.cancellationReason && (
          <DetailRow label="Motivo de Cancelamento/Rejeição" value={appointment.cancellationReason} />
        )}
      </FormSection>
    </div>
  );
}
