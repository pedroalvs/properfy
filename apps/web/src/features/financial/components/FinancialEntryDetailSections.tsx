import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';
import type { FinancialEntryDetail } from '../types';

interface FinancialEntryDetailSectionsProps {
  entry: FinancialEntryDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatCurrencyBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function FinancialEntryDetailSections({ entry }: FinancialEntryDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identificação">
        <DetailRow label="Vistoria" value={entry.appointmentCode} />
        <DetailRow label="Tipo" value={<FinancialEntryTypeChip entryType={entry.entryType} />} />
        <DetailRow label="Status" value={<FinancialStatusChip status={entry.status} />} />
        <DetailRow label="Referência" value={entry.referenceNumber} />
      </FormSection>

      <FormSection title="Valores">
        <DetailRow label="Valor" value={formatCurrencyBRL(entry.amount)} />
        <DetailRow label="Moeda" value={entry.currency} />
      </FormSection>

      <FormSection title="Detalhes">
        <DetailRow label="Descrição" value={entry.description} />
        <DetailRow label="Entidade" value={entry.relatedEntityName} />
        <DetailRow label="Data Efetiva" value={formatDateTimeBR(entry.effectiveAt)} />
        <DetailRow label="Aprovado Por" value={entry.approvedByName} />
        <DetailRow label="Aprovado Em" value={entry.approvedAt ? formatDateTimeBR(entry.approvedAt) : null} />
      </FormSection>

      {entry.notes && (
        <FormSection title="Observações">
          <DetailRow label="Notas" value={entry.notes} />
        </FormSection>
      )}

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(entry.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(entry.updatedAt)} />
      </FormSection>
    </div>
  );
}
