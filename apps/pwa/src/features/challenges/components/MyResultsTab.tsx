import type { InspectorProgramResponse } from '@properfy/shared';
import { BONUS_FOOTER, formatBonus, periodLabel } from '../lib/challenge-copy';
import { RewardStatusChip } from './RewardStatusChip';
import { StandingCards } from './StandingCards';

/** The My results tab: standing cards, reward history and the bonus footer (03.15, 03.A4). */
export function MyResultsTab({ program }: { program: InspectorProgramResponse }) {
  const { standing, awards } = program;

  return (
    <div className="flex flex-col gap-4">
      <StandingCards standing={standing} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-foreground">Rewards</h2>
        {awards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rewards yet. Reach a goal to earn one.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-2">
            {awards.map((award, index) => (
              <li
                key={`${award.goalTitle}-${award.periodEnd}-${index}`}
                className="flex items-start justify-between gap-3 rounded-card border border-border bg-card p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{award.goalTitle}</p>
                  <p className="text-xs text-muted-foreground">{periodLabel(award.periodType, award.periodStart)}</p>
                  <p className="text-sm font-semibold text-primary">{formatBonus(award.amount)}</p>
                </div>
                <RewardStatusChip status={award.status} inspectorNote={award.inspectorNote} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{BONUS_FOOTER}</p>
    </div>
  );
}
