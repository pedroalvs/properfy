import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PullToRefresh } from '../PullToRefresh';

describe('PullToRefresh', () => {
  const onRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onRefresh.mockClear();
  });

  it('renders children', () => {
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Content</p>
      </PullToRefresh>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with correct test id', () => {
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Content</p>
      </PullToRefresh>,
    );
    expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument();
  });

  it('does not show indicator initially', () => {
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Content</p>
      </PullToRefresh>,
    );
    expect(screen.queryByTestId('pull-indicator')).not.toBeInTheDocument();
  });

  it('calls onRefresh after pulling past threshold', async () => {
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Content</p>
      </PullToRefresh>,
    );

    const container = screen.getByTestId('pull-to-refresh');

    // Simulate pull gesture
    fireEvent.touchStart(container, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: 80 }] });
    fireEvent.touchEnd(container);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  it('does not call onRefresh for short pull', () => {
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Content</p>
      </PullToRefresh>,
    );

    const container = screen.getByTestId('pull-to-refresh');

    fireEvent.touchStart(container, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: 20 }] });
    fireEvent.touchEnd(container);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
