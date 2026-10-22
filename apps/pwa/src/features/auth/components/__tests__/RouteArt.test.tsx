import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteArt, ROUTE_STOPS } from '../RouteArt';

describe('RouteArt', () => {
  it('renders a decorative svg hidden from assistive tech', () => {
    render(<RouteArt />);

    const svg = screen.getByTestId('route-art');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('draws one pin per route stop', () => {
    render(<RouteArt />);

    expect(screen.getAllByTestId('route-stop')).toHaveLength(ROUTE_STOPS.length);
  });

  it('exposes no accessible image or text to the a11y tree', () => {
    render(<RouteArt />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('forwards a className to the svg', () => {
    render(<RouteArt className="absolute inset-0" />);

    expect(screen.getByTestId('route-art')).toHaveClass('absolute', 'inset-0');
  });
});
