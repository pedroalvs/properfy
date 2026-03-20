import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { ReportTypeChip } from './ReportTypeChip';
import { ReportStatusChip } from './ReportStatusChip';
import type { ReportDetail } from '../types';

interface ReportDetailSectionsProps {
  report: ReportDetail;
}

function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
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
        <DetailRow label="Requested By" value={report.requestedBy?.name ?? '—'} />
        <DetailRow label="Parameters" value={report.parameters} />
      </FormSection>

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(report.createdAt)} />
        {report.updatedAt && <DetailRow label="Updated At" value={formatDateTime(report.updatedAt)} />}
      </FormSection>
    </div>
  );
}
