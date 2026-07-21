import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapLassoToggleButton } from './MapLassoToggleButton';

describe('MapLassoToggleButton', () => {
  it('renders with label, icon and testid', () => {
    render(<MapLassoToggleButton active={false} onClick={() => {}} />);
    const btn = screen.getByTestId('map-lasso-toggle');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Select area');
    expect(screen.getByText('Select area')).toBeInTheDocument();
    const icon = btn.querySelector('.mdi-selection-drag');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<MapLassoToggleButton active={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('map-lasso-toggle'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reflects the active state via aria-pressed and primary styling', () => {
    render(<MapLassoToggleButton active onClick={() => {}} />);
    const btn = screen.getByTestId('map-lasso-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('bg-primary');
  });

  it('uses the idle pill styling when inactive', () => {
    render(<MapLassoToggleButton active={false} onClick={() => {}} />);
    const btn = screen.getByTestId('map-lasso-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.className).toContain('bg-card-bg');
  });
});
