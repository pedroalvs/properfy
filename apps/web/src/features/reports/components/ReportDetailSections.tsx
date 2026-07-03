import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { ReportTypeChip } from './ReportTypeChip';
import { ReportStatusChip } from './ReportStatusChip';
import type { ReportDetail } from '../types';
import { formatReportFilters, getReportFileName } from '../lib/report-display';

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
      </FormSection>

      <FormSection title="File">
        <DetailRow label="Name" value={getReportFileName(report) ?? '—'} />
        <DetailRow label="Size" value={formatFileSize(report.fileSize)} />
      </FormSection>

      <FormSection title="Request">
        <DetailRow label="Requested By" value={report.requestedBy?.name ?? '—'} />
        <DetailRow label="Filters" value={formatReportFilters(report)} />
        {report.errorMessage && <DetailRow label="Message" value={report.errorMessage} />}
      </FormSection>

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(report.createdAt)} />
        {report.updatedAt && <DetailRow label="Updated At" value={formatDateTime(report.updatedAt)} />}
        {report.completedAt && <DetailRow label="Completed At" value={formatDateTime(report.completedAt)} />}
        {report.failedAt && <DetailRow label="Failed At" value={formatDateTime(report.failedAt)} />}
        {report.expiresAt && <DetailRow label="Expires At" value={formatDateTime(report.expiresAt)} />}
      </FormSection>
    </div>
  );
}
