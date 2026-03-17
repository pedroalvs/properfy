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
      <FormSection title="Report">
        <DetailRow label="Type" value={<ReportTypeChip reportType={report.reportType} />} />
        <DetailRow label="Status" value={<ReportStatusChip status={report.status} />} />
        <DetailRow label="Format" value={report.format} />
      </FormSection>

      <FormSection title="File">
        <DetailRow label="Name" value={report.fileName} />
        <DetailRow label="Size" value={formatFileSize(report.fileSize)} />
      </FormSection>

      <FormSection title="Request">
        <DetailRow label="Requested By" value={report.requestedByName} />
        <DetailRow label="Parameters" value={report.parameters} />
      </FormSection>

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTimeBR(report.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTimeBR(report.updatedAt)} />
      </FormSection>
    </div>
  );
}
