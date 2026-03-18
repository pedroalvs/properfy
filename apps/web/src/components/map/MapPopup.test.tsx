import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapPopup } from './MapPopup';

describe('MapPopup', () => {
  const defaultProps = {
    title: 'Test Popup',
    onClose: vi.fn(),
    children: <p>Popup content</p>,
  };

  it('renders title', () => {
    render(<MapPopup {...defaultProps} />);
    expect(screen.getByText('Test Popup')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<MapPopup {...defaultProps} />);
    expect(screen.getByText('Popup content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<MapPopup {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders action buttons', () => {
    const handleView = vi.fn();
    render(
      <MapPopup
        {...defaultProps}
        actions={[{ label: 'View Details', onClick: handleView }]}
      />,
    );
    const button = screen.getByText('View Details');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleView).toHaveBeenCalledTimes(1);
  });

  it('does not render actions section when no actions', () => {
    render(<MapPopup {...defaultProps} />);
    expect(screen.queryByText('View Details')).not.toBeInTheDocument();
  });

  it('has accessible dialog role', () => {
    render(<MapPopup {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: 'Test Popup' })).toBeInTheDocument();
  });
});
