import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { FinancialEntryTypeChip } from '@/features/financial/components/FinancialEntryTypeChip';
import { FinancialStatusChip } from '@/features/financial/components/FinancialStatusChip';
import { formatDate } from '@/lib/format-date';
import { useAppointmentFinancialEntries, type AppointmentFinancialEntry } from '../hooks/useAppointmentFinancialEntries';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';

interface AppointmentFinancialTabProps {
  appointmentId: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
}

const columns: DataTableColumn<AppointmentFinancialEntry>[] = [
  {
    key: 'entryType',
    label: 'Type',
    width: '160px',
    render: (row) => <FinancialEntryTypeChip entryType={row.entryType as FinancialEntryType} />,
  },
  { key: 'description', label: 'Description' },
  {
    key: 'amount',
    label: 'Amount',
    width: '120px',
    align: 'right',
    render: (row) => formatCurrency(row.amount, row.currency),
  },
  {
    key: 'status',
    label: 'Status',
    width: '120px',
    render: (row) => <FinancialStatusChip status={row.status as FinancialEntryStatus} />,
  },
  {
    key: 'effectiveAt',
    label: 'Effective Date',
    width: '140px',
    render: (row) => formatDate(row.effectiveAt),
  },
];

export function AppointmentFinancialTab({ appointmentId }: AppointmentFinancialTabProps) {
  const { entries, isLoading, isError, refetch } = useAppointmentFinancialEntries(appointmentId);

  return (
    <DataTable
      columns={columns}
      data={entries}
      loading={isLoading}
      error={isError ? 'Failed to load financial entries' : undefined}
      onRetryError={refetch}
      emptyMessage="No financial entries for this appointment"
      keyExtractor={(row) => row.id}
    />
  );
}
