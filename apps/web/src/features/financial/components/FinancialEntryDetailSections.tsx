import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';
import type { FinancialEntryDetail } from '../types';

interface FinancialEntryDetailSectionsProps {
  entry: FinancialEntryDetail;
}

function formatCurrency(amount: number, currency: string): string {
  return amount.toLocaleString('en-AU', { style: 'currency', currency });
}

export function FinancialEntryDetailSections({ entry }: FinancialEntryDetailSectionsProps) {
  const showApprovalDetails = entry.status === 'APPROVED' || !!entry.approvedByName || !!entry.approvedAt;

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identification">
        <DetailRow label="Inspection" value={entry.appointmentCode} />
        <DetailRow label="Type" value={<FinancialEntryTypeChip entryType={entry.entryType} />} />
        <DetailRow label="Status" value={<FinancialStatusChip status={entry.status} />} />
        <DetailRow label="Reference" value={entry.referenceNumber} />
      </FormSection>

      <FormSection title="Values">
        <DetailRow label="Amount" value={formatCurrency(entry.amount, entry.currency)} />
        <DetailRow label="Currency" value={entry.currency} />
      </FormSection>

      <FormSection title="Details">
        <DetailRow label="Description" value={entry.description} />
        <DetailRow label="Entity" value={entry.relatedEntityName} />
        <DetailRow label="Effective Date" value={formatDate(entry.effectiveAt)} />
        {showApprovalDetails ? (
          <>
            <DetailRow label="Approved By" value={entry.approvedByName} />
            <DetailRow label="Approved At" value={entry.approvedAt ? formatDateTime(entry.approvedAt) : null} />
          </>
        ) : entry.status === 'PENDING' ? (
          <DetailRow label="Approval" value="Pending financial approval" />
        ) : null}
      </FormSection>

      {entry.notes && (
        <FormSection title="Notes">
          <DetailRow label="Notes" value={entry.notes} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created at" value={formatDateTime(entry.createdAt)} />
        <DetailRow label="Updated at" value={formatDateTime(entry.updatedAt)} />
      </FormSection>
    </div>
  );
}
