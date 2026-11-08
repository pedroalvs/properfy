import { formatCurrency, type ProgramPeriodSummaryResponse } from '@properfy/shared';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';

type SummaryGoal = ProgramPeriodSummaryResponse['goals'][number];

/** Per-goal promised × achieved breakdown for the selected period. */
export function GoalSummaryTable({ goals }: { goals: SummaryGoal[] }) {
  const columns: DataTableColumn<SummaryGoal>[] = [
    {
      key: 'title',
      label: 'Goal',
      render: (goal) => (
        <div>
          <span className="font-medium text-text-primary">{goal.title}</span>
          {goal.skipped && (
            <p className="text-xs text-text-muted">Skipped (goal inactive)</p>
          )}
        </div>
      ),
    },
    { key: 'rewardAmount', label: 'Per winner', width: '120px', align: 'right', render: (g) => formatCurrency(g.rewardAmount) },
    { key: 'participants', label: 'Participants', width: '120px', align: 'right', render: (g) => g.participants },
    {
      key: 'promised',
      label: 'Max payout',
      width: '120px',
      align: 'right',
      render: (g) => formatCurrency(g.skipped ? 0 : g.promised),
    },
    { key: 'achievers', label: 'Achievers', width: '110px', align: 'right', render: (g) => g.achievers },
    { key: 'achievedAmount', label: 'Achieved', width: '120px', align: 'right', render: (g) => formatCurrency(g.achievedAmount) },
  ];

  return (
    <DataTable
      columns={columns}
      data={goals}
      keyExtractor={(g) => g.goalId}
      emptyMessage="No goals ran in this period."
    />
  );
}
