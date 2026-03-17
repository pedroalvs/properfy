import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { ReportTypeChip } from './ReportTypeChip';
import { ReportStatusChip } from './ReportStatusChip';
import type { ReportDetail } from '../types';

interface ReportDetailSectionsProps {
  report: ReportDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function ReportDetailSections({ report }: ReportDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Relatório">
        <DetailRow label="Tipo" value={<ReportTypeChip reportType={report.reportType} />} />
        <DetailRow label="Status" value={<ReportStatusChip status={report.status} />} />
        <DetailRow label="Formato" value={report.format} />
      </FormSection>

      <FormSection title="Arquivo">
        <DetailRow label="Nome" value={report.fileName} />
        <DetailRow label="Tamanho" value={formatFileSize(report.fileSize)} />
      </FormSection>

      <FormSection title="Solicitação">
        <DetailRow label="Solicitado Por" value={report.requestedByName} />
        <DetailRow label="Parâmetros" value={report.parameters} />
      </FormSection>

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(report.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(report.updatedAt)} />
      </FormSection>
    </div>
  );
}
