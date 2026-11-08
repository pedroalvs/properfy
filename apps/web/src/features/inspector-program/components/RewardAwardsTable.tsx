import {
  GOAL_METRIC_KIND,
  RewardAwardStatus,
  INSPECTOR_LEVEL_LABELS,
  describeGoal,
  formatCurrency,
  type RewardAwardResponse,
} from '@properfy/shared';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { Button } from '@/components/ui/Button';
import { REWARD_AWARD_STATUS_MAP } from '@/lib/status-colors';

export interface RewardAwardsTableProps {
  awards: RewardAwardResponse[];
  onApprove: (awardId: string) => void;
  onVoid: (award: RewardAwardResponse) => void;
  /** The award whose action is in flight (per-row disable). */
  pendingId: string | null;
}

function resultText(award: RewardAwardResponse): string {
  const kind = GOAL_METRIC_KIND[award.metric];
  if (kind === 'VOLUME') return `${award.serviceCount} inspections`;
  if (kind === 'INDEX') return `${award.achievedValue}`;
  return `${award.achievedValue}%`;
}

function StatusChip({ status }: { status: RewardAwardStatus }) {
  const style = REWARD_AWARD_STATUS_MAP[status];
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}

/**
 * The period's reward awards (US2). Approve shows on PENDING, Void on
 * PENDING/APPROVED; there is **no "Mark as paid"** (Q12) and paid/voided rows
 * offer no action. Action labels carry the inspector's name (a11y).
 */
export function RewardAwardsTable({ awards, onApprove, onVoid, pendingId }: RewardAwardsTableProps) {
  const columns: DataTableColumn<RewardAwardResponse>[] = [
    {
      key: 'inspector',
      label: 'Inspector',
      render: (a) => (
        <div>
          <span className="font-medium text-text-primary">{a.inspector.name}</span>
          <p className="text-xs text-text-muted">{a.inspector.email}</p>
        </div>
      ),
    },
    {
      key: 'goal',
      label: 'Goal',
      render: (a) => (
        <div>
          <span className="text-text-primary">{a.goalTitle}</span>
          <p className="text-xs text-text-secondary">
            {describeGoal({ metric: a.metric, target: a.target, scopeLabel: a.scopeLabel })}
          </p>
        </div>
      ),
    },
    { key: 'result', label: 'Result', width: '120px', render: resultText },
    {
      key: 'index',
      label: 'Index at close',
      width: '120px',
      align: 'right',
      hideOnMobile: true,
      render: (a) => (a.indexScoreAtClose != null ? String(a.indexScoreAtClose) : '–'),
    },
    {
      key: 'level',
      label: 'Level',
      width: '100px',
      hideOnMobile: true,
      render: (a) => (a.levelAtClose ? INSPECTOR_LEVEL_LABELS[a.levelAtClose] : '–'),
    },
    { key: 'amount', label: 'Amount', width: '110px', align: 'right', render: (a) => formatCurrency(a.amount) },
    { key: 'status', label: 'Status', width: '130px', render: (a) => <StatusChip status={a.status} /> },
    {
      key: 'actions',
      label: '',
      width: '180px',
      render: (a) => {
        const busy = pendingId === a.id;
        // Disable every row's actions while any action is in flight, so a second
        // action can't be started and silently collapsed (one action at a time).
        const anyBusy = pendingId !== null;
        const canApprove = a.status === RewardAwardStatus.PENDING;
        const canVoid = a.status === RewardAwardStatus.PENDING || a.status === RewardAwardStatus.APPROVED;
        if (!canApprove && !canVoid) return null;
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {canApprove && (
              <Button
                variant="primary"
                className="px-2 py-1 text-xs"
                loading={busy}
                disabled={anyBusy}
                aria-label={`Approve reward for ${a.inspector.name}`}
                onClick={() => onApprove(a.id)}
              >
                Approve
              </Button>
            )}
            {canVoid && (
              <Button
                variant="outlined"
                className="px-2 py-1 text-xs"
                disabled={anyBusy}
                aria-label={`Void reward for ${a.inspector.name}`}
                onClick={() => onVoid(a)}
              >
                Void
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={awards}
      keyExtractor={(a) => a.id}
      emptyMessage="No rewards in this period."
    />
  );
}
