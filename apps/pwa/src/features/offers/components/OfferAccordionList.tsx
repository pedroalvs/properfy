import { OfferCard } from './OfferCard';
import { GroupDetailContent } from './GroupDetailContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface Props {
  offers: MarketplaceOffer[];
  /** The one expanded offer (shared with the map drill-down). */
  expandedGroupId: string | null;
  onToggle: (groupId: string) => void;
  getState: (groupId: string) => OfferAcceptState;
  onAcceptGroup: (groupId: string) => void;
  onRefresh: () => void;
}

const RESOLVED_STATES: OfferAcceptState[] = ['ACCEPTED', 'CONFLICT', 'GONE'];

/**
 * The right pane of the extended (tablet/landscape) marketplace: a vertical
 * accordion of offers. Exactly one expands at a time, revealing its inspections,
 * group total and "Accept group" CTA — the same `GroupDetailContent` the phone
 * bottom-sheet uses. The expanded id is shared with the map, so selecting here
 * draws that group's route on the map and vice-versa.
 */
export function OfferAccordionList({
  offers,
  expandedGroupId,
  onToggle,
  getState,
  onAcceptGroup,
  onRefresh,
}: Props) {
  if (offers.length === 0) {
    return (
      <EmptyState
        title="No offers available"
        description="Check back later for new inspection offers"
        icon="mdi-tag-off-outline"
        action={{ label: 'Refresh', onClick: onRefresh }}
      />
    );
  }

  // Resolved offers sink to the bottom; the rest sort by date — same order as
  // the phone feed, so the two layouts never disagree on ranking.
  const sorted = [...offers].sort((a, b) => {
    const aResolved = RESOLVED_STATES.includes(getState(a.groupId));
    const bResolved = RESOLVED_STATES.includes(getState(b.groupId));
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    return a.scheduledDate.localeCompare(b.scheduledDate);
  });

  return (
    <div data-testid="offer-accordion" className="flex flex-col gap-3">
      {sorted.map((offer) => {
        const expanded = offer.groupId === expandedGroupId;
        const state = getState(offer.groupId);
        return (
          <div key={offer.groupId}>
            <OfferCard
              offer={offer}
              state={state}
              onAccept={() => onToggle(offer.groupId)}
              onViewDetail={() => onToggle(offer.groupId)}
              showAccept={false}
              selected={expanded}
              expanded={expanded}
            />
            {expanded && (
              <div
                className="mt-2 flex max-h-[380px] flex-col overflow-hidden rounded-[20px] border border-primary/20 bg-white"
                data-testid={`offer-detail-${offer.groupId}`}
              >
                <GroupDetailContent
                  groupId={offer.groupId}
                  onAccept={() => onAcceptGroup(offer.groupId)}
                  accepting={state === 'ACCEPTING'}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
