import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteArt, ROUTE_STOPS } from './RouteArt';

describe('RouteArt', () => {
  it('stays out of the accessibility tree and exposes no image role', () => {
    render(<RouteArt />);

    expect(screen.getByTestId('route-art')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('draws one pin per stop', () => {
    render(<RouteArt />);

    expect(screen.getAllByTestId('route-stop')).toHaveLength(ROUTE_STOPS.length);
  });

  /**
   * The numbering is the one structural device here, and it only earns its place
   * because the stops are a round: the order is the information.
   */
  it('labels the stops in round order', () => {
    render(<RouteArt />);

    const labels = screen.getAllByTestId('route-label').map((node) => node.textContent);

    expect(labels).toEqual(['01Newtown', '02Surry Hills', '03Paddington', '04Bondi Junction', '05Randwick']);
  });

  /**
   * The pane's width is fixed but its height is not, so its aspect ratio moves with the
   * window. Under `slice` the first and last stops fall off the canvas on a short one —
   * a regression that looks like a deliberate crop rather than a bug, which is why it
   * needs a test rather than an eye.
   */
  it('fits the whole round into the pane instead of cropping it', () => {
    render(<RouteArt />);

    expect(screen.getByTestId('route-art')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  });

  /**
   * The load reveal animates `stroke-dashoffset` from 1 to 0. Without `pathLength="1"`
   * that offset is measured in user units, so the route would render fully drawn from
   * the first frame and the signature moment would silently disappear.
   */
  it('normalises the route path length so the draw animation is geometry-independent', () => {
    render(<RouteArt />);

    expect(screen.getByTestId('route-path')).toHaveAttribute('pathLength', '1');
  });
});
