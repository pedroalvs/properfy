import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { ServiceGroupDetail } from '../types';

interface ServiceGroupDetailSectionsProps {
  serviceGroup: ServiceGroupDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function ServiceGroupDetailSections({ serviceGroup }: ServiceGroupDetailSectionsProps) {
  const priorityStyle = PRIORITY_MODE_MAP[serviceGroup.priorityMode];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Informações">
        <DetailRow label="Nome" value={serviceGroup.name} />
        <DetailRow label="Região" value={serviceGroup.regionName} />
        <DetailRow label="Status" value={<ServiceGroupStatusChip status={serviceGroup.status} />} />
        <DetailRow
          label="Prioridade"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.text }}
            >
              {priorityStyle.label}
            </span>
          }
        />
      </FormSection>

      <FormSection title="Inspetor">
        <DetailRow label="Nome do Inspetor" value={serviceGroup.inspectorName} />
      </FormSection>

      <FormSection title="Vistorias">
        <DetailRow label="Quantidade" value={serviceGroup.appointmentsCount.toString()} />
        <DetailRow label="Códigos" value={serviceGroup.appointmentCodes.length > 0 ? serviceGroup.appointmentCodes.join(', ') : null} />
      </FormSection>

      {serviceGroup.description && (
        <FormSection title="Observações">
          <DetailRow label="Descrição" value={serviceGroup.description} />
        </FormSection>
      )}

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(serviceGroup.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(serviceGroup.updatedAt)} />
      </FormSection>
    </div>
  );
}
