import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapFloatingAction } from './MapFloatingAction';

describe('MapFloatingAction', () => {
  const actions = [
    { icon: 'mdi-crosshairs-gps', label: 'Re-center', onClick: vi.fn() },
    { icon: 'mdi-layers-outline', label: 'Layers', onClick: vi.fn() },
  ];

  it('renders action buttons', () => {
    render(<MapFloatingAction actions={actions} />);
    expect(screen.getByRole('button', { name: 'Re-center' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layers' })).toBeInTheDocument();
  });

  it('calls onClick when action is clicked', () => {
    render(<MapFloatingAction actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-center' }));
    expect(actions[0]!.onClick).toHaveBeenCalledTimes(1);
  });

  it('renders in bottom-right by default', () => {
    render(<MapFloatingAction actions={actions} />);
    const container = screen.getByTestId('map-floating-action');
    expect(container.className).toContain('bottom-4');
    expect(container.className).toContain('right-4');
  });

  it('renders in top-right when specified', () => {
    render(<MapFloatingAction actions={actions} position="top-right" />);
    const container = screen.getByTestId('map-floating-action');
    expect(container.className).toContain('top-4');
    expect(container.className).toContain('right-4');
  });
});
