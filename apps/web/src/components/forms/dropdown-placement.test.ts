import { describe, it, expect } from 'vitest';
import { resolveDropdownPlacement, DROPDOWN_MIN_SPACE } from './dropdown-placement';

/**
 * A dropdown rendered `absolute top-full` inside a scrolling container is
 * clipped by that container, not by the viewport. When the trigger sits near
 * the container's bottom edge the options render into the clipped region and
 * the menu looks empty — which is what happened to the "Change status" row at
 * the bottom of the bulk-edit dialog on staging.
 */
describe('resolveDropdownPlacement', () => {
  it('opens downward when there is room below', () => {
    expect(
      resolveDropdownPlacement({ triggerTop: 100, triggerBottom: 140, clipTop: 0, clipBottom: 800 }),
    ).toBe('below');
  });

  it('opens upward when the space below is cramped and there is more above', () => {
    // Trigger ends 4px from the clipping edge — exactly the staging case.
    expect(
      resolveDropdownPlacement({ triggerTop: 532, triggerBottom: 572, clipTop: 200, clipBottom: 576 }),
    ).toBe('above');
  });

  it('stays below when both sides are cramped but below has more room', () => {
    // Flipping would make it worse; keep the default so behaviour is stable.
    expect(
      resolveDropdownPlacement({ triggerTop: 60, triggerBottom: 100, clipTop: 50, clipBottom: 200 }),
    ).toBe('below');
  });

  it('stays below at exactly the minimum space, flipping only past the threshold', () => {
    const atThreshold = {
      triggerTop: 300,
      triggerBottom: 340,
      clipTop: 0,
      clipBottom: 340 + DROPDOWN_MIN_SPACE,
    };
    expect(resolveDropdownPlacement(atThreshold)).toBe('below');
    expect(
      resolveDropdownPlacement({ ...atThreshold, clipBottom: 340 + DROPDOWN_MIN_SPACE - 1 }),
    ).toBe('above');
  });
});
