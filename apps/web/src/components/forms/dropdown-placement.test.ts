import { describe, it, expect } from 'vitest';
import {
  resolveDropdownPlacement,
  clippingRect,
  DROPDOWN_MIN_SPACE,
  DROPDOWN_MAX_HEIGHT,
} from './dropdown-placement';

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
      resolveDropdownPlacement({ triggerTop: 100, triggerBottom: 140, clipTop: 0, clipBottom: 800 })
        .placement,
    ).toBe('below');
  });

  it('opens upward when the space below is cramped and there is more above', () => {
    // Trigger ends 4px from the clipping edge — exactly the staging case.
    expect(
      resolveDropdownPlacement({ triggerTop: 532, triggerBottom: 572, clipTop: 200, clipBottom: 576 })
        .placement,
    ).toBe('above');
  });

  it('stays below when both sides are cramped but below has more room', () => {
    // Flipping would make it worse; keep the default so behaviour is stable.
    expect(
      resolveDropdownPlacement({ triggerTop: 60, triggerBottom: 100, clipTop: 50, clipBottom: 200 })
        .placement,
    ).toBe('below');
  });

  it('stays below at exactly the minimum space, flipping only past the threshold', () => {
    const atThreshold = {
      triggerTop: 300,
      triggerBottom: 340,
      clipTop: 0,
      clipBottom: 340 + DROPDOWN_MIN_SPACE,
    };
    expect(resolveDropdownPlacement(atThreshold).placement).toBe('below');
    expect(
      resolveDropdownPlacement({ ...atThreshold, clipBottom: 340 + DROPDOWN_MIN_SPACE - 1 })
        .placement,
    ).toBe('above');
  });
});

/**
 * `clippingRect` decides WHICH rectangle the placement is measured against, so
 * a wrong answer here silently defeats the flip. jsdom performs no layout, so
 * geometry is stubbed per element.
 */
describe('clippingRect', () => {
  function build(html: string) {
    document.body.innerHTML = html;
    return document.getElementById('leaf') as HTMLElement;
  }

  function stub(el: Element, top: number, bottom: number) {
    el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top }) as DOMRect;
  }

  it('falls back to the viewport when nothing clips', () => {
    const leaf = build('<div><div id="leaf"></div></div>');
    expect(clippingRect(leaf)).toEqual({ top: 0, bottom: window.innerHeight });
  });

  it('uses the nearest scrolling ancestor, not an outer one', () => {
    const leaf = build(
      '<div id="outer" style="overflow-y:auto"><div id="inner" style="overflow-y:auto"><div id="leaf"></div></div></div>',
    );
    stub(document.getElementById('outer')!, 0, 900);
    stub(document.getElementById('inner')!, 200, 576);
    expect(clippingRect(leaf)).toEqual({ top: 200, bottom: 576 });
  });

  it('treats overflow hidden as clipping', () => {
    const leaf = build('<div id="box" style="overflow-y:hidden"><div id="leaf"></div></div>');
    stub(document.getElementById('box')!, 100, 400);
    expect(clippingRect(leaf)).toEqual({ top: 100, bottom: 400 });
  });

  it('skips a zero-height ancestor rather than trusting it', () => {
    // An unlaid-out or collapsed ancestor would otherwise report a degenerate
    // rect and force every dropdown to flip.
    const leaf = build(
      '<div id="real" style="overflow-y:auto"><div id="collapsed" style="overflow-y:auto"><div id="leaf"></div></div></div>',
    );
    stub(document.getElementById('real')!, 50, 700);
    stub(document.getElementById('collapsed')!, 0, 0);
    expect(clippingRect(leaf)).toEqual({ top: 50, bottom: 700 });
  });
});

/**
 * Regression: flipping upward is only safe if the menu FITS above. The first
 * version checked that there was more room above than below, but not that the
 * menu fit — so in the status-transition dialog the flipped menu overflowed the
 * panel and the modal backdrop ended up on top of it, swallowing every click.
 */
describe('resolveDropdownPlacement — height', () => {
  it('never returns a height larger than the space on the chosen side', () => {
    // 120px above, 20px below: flips up, but only 120px of menu fit there.
    const { placement, maxHeight } = resolveDropdownPlacement({
      triggerTop: 320,
      triggerBottom: 360,
      clipTop: 200,
      clipBottom: 380,
    });
    expect(placement).toBe('above');
    expect(maxHeight).toBeLessThanOrEqual(120);
    expect(maxHeight).toBeGreaterThan(0);
  });

  it('caps at the design maximum when there is abundant room', () => {
    const { maxHeight } = resolveDropdownPlacement({
      triggerTop: 100,
      triggerBottom: 140,
      clipTop: 0,
      clipBottom: 2000,
    });
    expect(maxHeight).toBe(DROPDOWN_MAX_HEIGHT);
  });

  it('bounds the downward height by the container, not the viewport', () => {
    const { placement, maxHeight } = resolveDropdownPlacement({
      triggerTop: 100,
      triggerBottom: 140,
      clipTop: 0,
      clipBottom: 340,
    });
    expect(placement).toBe('below');
    expect(maxHeight).toBeLessThanOrEqual(200);
  });
});
