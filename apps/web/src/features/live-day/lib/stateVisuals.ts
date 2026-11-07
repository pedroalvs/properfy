import { LIVE_DAY_STATE_LABELS, type LiveDayInspectorState } from '@properfy/shared';

/**
 * Visual encoding of an inspector's derived state (D2 / FR-026). State is shown
 * by icon + text + the pin head colour — never the inspector's identity colour.
 * `headColor` feeds `MapMarker.headColor` (inline background), so a CSS var is
 * fine; `textClass` colours the list badge. Labels come from the shared contract
 * (`LIVE_DAY_STATE_LABELS`), so "At a property" etc. stay consistent everywhere.
 */
export interface StateVisual {
  label: string;
  icon: string;
  headColor: string;
  textClass: string;
}

export const STATE_VISUALS: Record<LiveDayInspectorState, StateVisual> = {
  NOT_STARTED: {
    label: LIVE_DAY_STATE_LABELS.NOT_STARTED,
    icon: 'mdi-clock-outline',
    headColor: '#4B5563',
    textClass: 'text-text-secondary',
  },
  AT_PROPERTY: {
    label: LIVE_DAY_STATE_LABELS.AT_PROPERTY,
    icon: 'mdi-home-account',
    headColor: 'var(--color-info)',
    textClass: 'text-info',
  },
  IN_TRANSIT: {
    label: LIVE_DAY_STATE_LABELS.IN_TRANSIT,
    icon: 'mdi-car',
    headColor: 'var(--color-warning)',
    textClass: 'text-warning',
  },
  DONE_FOR_DAY: {
    label: LIVE_DAY_STATE_LABELS.DONE_FOR_DAY,
    icon: 'mdi-check-all',
    headColor: 'var(--color-success)',
    textClass: 'text-success',
  },
};
