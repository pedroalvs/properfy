import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapListViewToggleButton } from './MapListViewToggleButton';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('MapListViewToggleButton', () => {
  it('renders with correct label and icon', () => {
    render(<MapListViewToggleButton />);
    const btn = screen.getByTestId('map-list-view-toggle');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Switch to list view');
    expect(screen.getByText('List view')).toBeInTheDocument();
  });

  it('navigates to /appointments/list on click', () => {
    render(<MapListViewToggleButton />);
    fireEvent.click(screen.getByTestId('map-list-view-toggle'));
    expect(mockNavigate).toHaveBeenCalledWith('/appointments/list');
  });

  it('does not have aria-pressed (navigation, not a stateful toggle)', () => {
    render(<MapListViewToggleButton />);
    expect(screen.getByTestId('map-list-view-toggle')).not.toHaveAttribute('aria-pressed');
  });
});
