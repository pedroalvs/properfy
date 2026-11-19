import {
  resolveInspectorLevel,
  INSPECTOR_LEVEL_LABELS,
  type ReliabilityRankingResponse,
  type InspectorLevelThresholds,
} from '@properfy/shared';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { formatScore } from '../lib/format-metric';

export type RankedInspector = ReliabilityRankingResponse['ranked'][number];

export interface RankingTableProps {
  rows: RankedInspector[];
  onOpen: (inspectorId: string, trigger: HTMLElement | null) => void;
  /**
   * Level thresholds from the `inspectorProgram` platform setting (F08 03.11). The
   * Level column is derived client-side from each row's score; `null` (setting still
   * loading or unreadable) renders "–".
   */
  levelThresholds?: InspectorLevelThresholds | null;
}

function ScoreCell({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums font-semibold text-text-primary">{formatScore(score)}</span>
      <span
        aria-hidden="true"
        className="hidden h-1.5 w-24 overflow-hidden rounded bg-app-bg sm:block"
      >
        <span className="block h-full rounded bg-primary" style={{ width: `${score}%` }} />
      </span>
    </div>
  );
}

/**
 * The reliability ranking (03.11). Order is the server competition ranking — no
 * pagination, no clickable sort. `DataTable` rows are not keyboard-focusable, so
 * the actionable affordance is a focusable button in the "Inspector" cell
 * (`aria-label` "Open {name} details"); `onRowClick` serves pointer users.
 */
export function RankingTable({ rows, onOpen, levelThresholds }: RankingTableProps) {
  const levelLabel = (score: number): string => {
    if (!levelThresholds) return '–';
    const level = resolveInspectorLevel(score, levelThresholds);
    return level ? INSPECTOR_LEVEL_LABELS[level] : '–';
  };
  const columns: DataTableColumn<RankedInspector>[] = [
    {
      key: 'position',
      label: 'Rank',
      width: '72px',
      render: (row) => <span aria-label={`Rank ${row.position}`}>{row.position}</span>,
    },
    {
      key: 'inspectorName',
      label: 'Inspector',
      render: (row) => (
        <button
          type="button"
          className="max-w-full truncate text-left font-medium text-primary hover:underline"
          title={row.inspectorName}
          aria-label={`Open ${row.inspectorName} details`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row.inspectorId, event.currentTarget);
          }}
        >
          {row.inspectorName}
        </button>
      ),
    },
    {
      key: 'score',
      label: 'Score',
      width: '160px',
      render: (row) => <ScoreCell score={row.score} />,
    },
    {
      key: 'level',
      label: 'Level',
      width: '100px',
      render: (row) => levelLabel(row.score),
    },
    {
      key: 'volume',
      label: 'Services',
      width: '110px',
      hideOnMobile: true,
    },
  ];

  return (
    <div>
      <h2 className="sr-only">Inspectors ranked by reliability score</h2>
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.inspectorId}
        onRowClick={(row) => onOpen(row.inspectorId, null)}
        emptyMessage="No inspector has enough services to be ranked yet."
      />
    </div>
  );
}
