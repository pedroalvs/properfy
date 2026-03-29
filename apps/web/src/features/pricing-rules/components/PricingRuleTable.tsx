import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { PricingRule } from '../types';

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixed',
  PERCENTAGE: 'Percentage',
};

interface PricingRuleTableProps {
  data: PricingRule[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onEdit?: (rule: PricingRule) => void;
}

export function PricingRuleTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onEdit,
}: PricingRuleTableProps) {
  const formatCurrency = (value: number, currency: string) =>
    value.toLocaleString('en-AU', { style: 'currency', currency });

  const columns: DataTableColumn<PricingRule>[] = [
    {
      key: 'tenantName',
      label: 'Agency',
      width: '160px',
      sortable: true,
      render: (row) => <>{row.tenantName ?? row.tenantId}</>,
    },
    {
      key: 'serviceTypeName',
      label: 'Service Type',
      width: '160px',
      sortable: true,
      render: (row) => <>{row.serviceTypeName ?? row.serviceTypeId}</>,
    },
    {
      key: 'branchName',
      label: 'Branch',
      width: '140px',
      render: (row) => <>{row.branchName ?? row.branchId ?? '—'}</>,
    },
    {
      key: 'priceAmount',
      label: 'Price',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {formatCurrency(row.priceAmount, row.currency)}
        </span>
      ),
    },
    {
      key: 'payoutType',
      label: 'Payout Type',
      width: '120px',
      render: (row) => <>{PAYOUT_TYPE_LABELS[row.payoutType] ?? row.payoutType}</>,
    },
    {
      key: 'payoutValue',
      label: 'Payout Value',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {row.payoutType === 'PERCENTAGE'
            ? `${row.payoutValue}%`
            : formatCurrency(row.payoutValue, row.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '100px',
      sortable: true,
      render: (row) => {
        const style = SERVICE_TYPE_STATUS_MAP[row.status as keyof typeof SERVICE_TYPE_STATUS_MAP];
        if (!style) return <>{row.status}</>;
        return (
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {style.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-pencil-outline',
              label: 'Edit',
              onClick: () => onEdit?.(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<PricingRule>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      defaultSort={{ key: 'createdAt', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
