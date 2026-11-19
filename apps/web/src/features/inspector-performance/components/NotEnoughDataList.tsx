import type { ReliabilityRankingResponse } from '@properfy/shared';
import { PageSectionHeader } from '@/components/layout/PageSectionHeader';

export type NotEnoughDataInspector = ReliabilityRankingResponse['notEnoughData'][number];

export interface NotEnoughDataListProps {
  items: NotEnoughDataInspector[];
  minimumVolume: number;
  onOpen: (inspectorId: string, trigger: HTMLElement | null) => void;
}

function describe(item: NotEnoughDataInspector, minimumVolume: number): string {
  if (item.status === 'NO_WEIGHTED_DATA') return 'No data for the weighted metrics';
  return `${item.volume} of ${minimumVolume} services`;
}

/**
 * The "Not enough data" block (03.11): inspectors below the minimum volume (or
 * with no weighted data) are listed here, not ranked. Each row opens the same
 * drawer as a ranked row. Renders nothing when there is no one to show.
 */
export function NotEnoughDataList({ items, minimumVolume, onOpen }: NotEnoughDataListProps) {
  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <PageSectionHeader title="Not enough data" />
      <p className="mb-3 text-sm text-text-secondary">
        {`Inspectors with fewer than ${minimumVolume} services in the last 30 days are not ranked.`}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.inspectorId}>
            <button
              type="button"
              className="w-full rounded bg-card-bg px-4 py-3 text-left text-sm text-text-primary shadow-sm hover:bg-hover-row"
              aria-label={`Open ${item.inspectorName} details`}
              onClick={(event) => onOpen(item.inspectorId, event.currentTarget)}
            >
              <span className="font-medium">{item.inspectorName}</span>
              <span className="text-text-secondary">{` · ${describe(item, minimumVolume)}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
