import { describe, expect, it } from 'vitest';
import { resolveTourSteps, TARGET_STEPS } from '../tour-steps';

describe('resolveTourSteps', () => {
  it('returns 8 target steps + install (9) in a browser', () => {
    const steps = resolveTourSteps({ isStandalone: false, isIosSafariEligible: false, canInstall: true });
    expect(steps).toHaveLength(9);
    expect(steps.filter((s) => s.kind === 'target')).toHaveLength(8);
    expect(steps[8]).toMatchObject({ kind: 'install', title: 'Install Properfy' });
  });

  it('omits the install step in standalone (8)', () => {
    const steps = resolveTourSteps({ isStandalone: true, isIosSafariEligible: false, canInstall: false });
    expect(steps).toHaveLength(8);
    expect(steps.every((s) => s.kind === 'target')).toBe(true);
  });

  it('keeps the frozen order of target anchors (L-F04-12)', () => {
    const steps = resolveTourSteps({ isStandalone: true, isIosSafariEligible: false, canInstall: false });
    expect(steps.map((s) => s.anchor)).toEqual([
      'nav-today',
      'today-next',
      'today-next-actions',
      'today-more-actions',
      'today-route-link',
      'nav-schedule',
      'nav-offers',
      'nav-more',
    ]);
  });

  it('uses the frozen titles and texts verbatim', () => {
    expect(TARGET_STEPS[0]).toMatchObject({
      anchor: 'nav-today',
      title: 'Today',
      body: "Your day at a glance: what's next, what's done and when you'll finish.",
      condition: 'always',
    });
    expect(TARGET_STEPS[3]).toMatchObject({
      anchor: 'today-more-actions',
      title: "Running late or can't do it?",
      body: 'Tell us here. The job is released and operations are alerted straight away.',
      condition: 'target-exists',
    });
    expect(TARGET_STEPS[4].body).toBe(
      'See every stop in order, on a list or a map, and change the order if you need to.',
    );
  });

  it('marks the four nav steps as always-present and the card steps as target-exists', () => {
    const always = TARGET_STEPS.filter((s) => s.condition === 'always').map((s) => s.anchor);
    expect(always).toEqual(['nav-today', 'nav-schedule', 'nav-offers', 'nav-more']);
  });

  it('keeps every body within 140 characters', () => {
    for (const step of TARGET_STEPS) {
      expect(step.body.length).toBeLessThanOrEqual(140);
    }
  });
});
