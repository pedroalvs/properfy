/**
 * The app-tour step catalog (pure). Counts and texts are frozen by L-F04-12:
 * 8 target steps + 1 install step → 9 in a browser, 8 in standalone. Titles and
 * bodies are used verbatim by the E2E and component tests; do not reword them
 * without updating the contract.
 */

export type TourStepCondition = 'always' | 'target-exists';

export interface TourStep {
  /** Stable id for keys/tests. */
  id: string;
  kind: 'target' | 'install';
  /** `data-tour` selector key for target steps; absent for the install step. */
  anchor?: string;
  title: string;
  /** Body copy for target steps; the install step renders `InstallStepBody` instead. */
  body: string;
  condition: TourStepCondition;
}

/** The 8 target steps, in order (L-F04-12). */
export const TARGET_STEPS: readonly TourStep[] = [
  {
    id: 'today',
    kind: 'target',
    anchor: 'nav-today',
    title: 'Today',
    body: "Your day at a glance: what's next, what's done and when you'll finish.",
    condition: 'always',
  },
  {
    id: 'next',
    kind: 'target',
    anchor: 'today-next',
    title: 'Next inspection',
    body: "The job you're heading to, with its window and ETA. Tap it for full details.",
    condition: 'target-exists',
  },
  {
    id: 'next-actions',
    kind: 'target',
    anchor: 'today-next-actions',
    title: 'Navigate and check in',
    body: 'Navigate opens your maps app. Check in when you arrive and check out when you finish.',
    condition: 'target-exists',
  },
  {
    id: 'more-actions',
    kind: 'target',
    anchor: 'today-more-actions',
    title: "Running late or can't do it?",
    body: 'Tell us here. The job is released and operations are alerted straight away.',
    condition: 'target-exists',
  },
  {
    id: 'route',
    kind: 'target',
    anchor: 'today-route-link',
    title: 'Your route',
    body: 'See every stop in order, on a list or a map, and change the order if you need to.',
    condition: 'target-exists',
  },
  {
    id: 'schedule',
    kind: 'target',
    anchor: 'nav-schedule',
    title: 'Schedule',
    body: 'All your upcoming jobs, day by day, and your history.',
    condition: 'always',
  },
  {
    id: 'offers',
    kind: 'target',
    anchor: 'nav-offers',
    title: 'Offers',
    body: 'Groups of jobs near you. Accept the ones that fit your week.',
    condition: 'always',
  },
  {
    id: 'more',
    kind: 'target',
    anchor: 'nav-more',
    title: 'More',
    body: 'Announcements, earnings, your profile and app settings.',
    condition: 'always',
  },
];

const INSTALL_STEP: TourStep = {
  id: 'install',
  kind: 'install',
  title: 'Install Properfy',
  body: '',
  condition: 'always',
};

export interface TourStepFlags {
  isStandalone: boolean;
  /** For `InstallStepBody` platform copy (not used for inclusion). */
  isIosSafariEligible: boolean;
  canInstall: boolean;
}

/**
 * The full step list before runtime target-presence filtering: all 8 target
 * steps, plus the install step only when the app is not already installed.
 * Target steps whose anchor is absent at runtime are skipped by `AppTour`.
 */
export function resolveTourSteps(flags: TourStepFlags): TourStep[] {
  const steps = [...TARGET_STEPS];
  if (!flags.isStandalone) steps.push(INSTALL_STEP);
  return steps;
}
