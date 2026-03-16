import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import type { InspectorDetail } from '../types';

interface InspectorDetailSectionsProps {
  inspector: InspectorDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatList(items: string[]): string | null {
  return items.length > 0 ? items.join(', ') : null;
}

function formatRating(rating: number | null): string | null {
  return rating !== null ? `${rating.toFixed(1)} / 5.0` : null;
}

export function InspectorDetailSections({ inspector }: InspectorDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Dados Pessoais">
        <DetailRow label="Nome" value={inspector.name} />
        <DetailRow label="E-mail" value={inspector.email} />
        <DetailRow label="Telefone" value={inspector.phone} />
        <DetailRow label="CPF" value={inspector.document} />
      </FormSection>

      <FormSection title="Atuação">
        <DetailRow label="Regiões" value={formatList(inspector.regions)} />
        <DetailRow label="Tipos de Serviço" value={formatList(inspector.serviceTypes)} />
        <DetailRow label="Avaliação" value={formatRating(inspector.rating)} />
      </FormSection>

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(inspector.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(inspector.updatedAt)} />
      </FormSection>
    </div>
  );
}
