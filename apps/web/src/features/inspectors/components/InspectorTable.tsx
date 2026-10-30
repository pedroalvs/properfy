import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { InspectorStatusChip } from './InspectorStatusChip';
import type { Inspector } from '../types';
import { StarRating } from '@/components/ui/StarRating';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatAuPhone } from '@/lib/phone-mask';
import { formatInstantDate } from '@/lib/format-date';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { formatLastSeenAbsolute, formatLastSeenRelative } from '../lib/adoption-format';

interface InspectorTableProps {
  data: Inspector[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (inspector: Inspector) => void;
  /** Filter-aware empty message (e.g. the "No base address" filter). */
  emptyMessage?: string;
}

export function InspectorTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  emptyMessage,
}: InspectorTableProps) {
  const columns: DataTableColumn<Inspector>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.name}</span>
          {row.baseLat === null && (
            <Tooltip
              label={row.address == null ? 'Missing base address' : 'Address could not be located'}
            >
              <span className="inline-flex items-center whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning">
                No base address
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      width: '220px',
      sortable: true,
    },
    {
      key: 'phone',
      label: 'Phone',
      width: '140px',
      render: (row) => <>{row.phone ? formatAuPhone(row.phone) : '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <InspectorStatusChip status={row.status} />,
    },
    {
      // F01-2 app adoption. "Installed" is true for ANY device that ever reported
      // standalone (D16); the tooltip carries the date. Sorted by install instant,
      // nulls (never installed) last.
      key: 'appInstalledAt',
      label: 'App',
      width: '110px',
      sortable: true,
      render: (row) =>
        row.appInstalledAt ? (
          <Tooltip label={`Installed on ${formatInstantDate(row.appInstalledAt, PLATFORM_TIMEZONE)} (any device)`}>
            <span className="text-success">Installed</span>
          </Tooltip>
        ) : (
          <Tooltip label="Not installed">
            <span className="text-text-muted">&mdash;</span>
          </Tooltip>
        ),
    },
    {
      // Push permission on the LAST device seen (D9, D16). null = never reported.
      key: 'pushEnabled',
      label: 'Push',
      width: '90px',
      sortable: true,
      render: (row) => {
        if (row.pushEnabled === null) {
          return (
            <Tooltip label="No data yet">
              <span className="text-text-muted">&mdash;</span>
            </Tooltip>
          );
        }
        return (
          <Tooltip label="Browser notification permission on the last device seen">
            <span className={row.pushEnabled ? 'text-success' : 'text-text-muted'}>
              {row.pushEnabled ? 'On' : 'Off'}
            </span>
          </Tooltip>
        );
      },
    },
    {
      // Last heartbeat from any device. Relative in the cell, absolute Sydney time
      // in the tooltip; the value may lag up to 6 h (client throttle, L-F01-09).
      key: 'appLastSeenAt',
      label: 'Last seen',
      width: '130px',
      sortable: true,
      render: (row) => {
        const relative = formatLastSeenRelative(row.appLastSeenAt);
        const absolute = formatLastSeenAbsolute(row.appLastSeenAt);
        if (!absolute) {
          return <span className="text-text-muted">{relative}</span>;
        }
        return (
          <Tooltip label={`Last reported ${absolute} (Sydney) · reported at most every 6 h`}>
            <span>{relative}</span>
          </Tooltip>
        );
      },
    },
    {
      key: 'regionsCount',
      label: 'Regions',
      width: '100px',
    },
    {
      // Renamed from "Services": this has always been service-TYPE coverage, and
      // the ambiguity became untenable next to the completed-inspections count.
      key: 'serviceTypesCount',
      label: 'Service Types',
      width: '120px',
    },
    {
      key: 'ratingAvg',
      label: 'Rating',
      width: '140px',
      // Sorts the loaded page only, exactly like the existing name/email/status
      // columns — DataTable sorting is client-side.
      sortable: true,
      render: (row) => <StarRating value={row.ratingAvg} count={row.ratingCount} size="sm" showValue />,
    },
    {
      key: 'completedCount',
      label: 'Completed',
      width: '110px',
      sortable: true,
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-eye-outline',
              label: 'View',
              onClick: () => onView?.(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<Inspector>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      defaultSort={{ key: 'name', order: 'asc' }}
      keyExtractor={(row) => row.id}
      {...(emptyMessage ? { emptyMessage } : {})}
    />
  );
}
