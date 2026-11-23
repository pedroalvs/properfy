import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushStatusIndicator } from '../PushStatusIndicator';
import { PushControlContext, type PushControlValue } from '../../context/PushControlProvider';
import type { PushState } from '../../hooks/usePushSubscription';

function renderIndicator(overrides: Partial<PushControlValue> = {}) {
  const value: PushControlValue = {
    state: 'off',
    error: null,
    optedOut: false,
    enable: vi.fn(),
    disable: vi.fn(),
    requestEnable: vi.fn(),
    declinePersistently: vi.fn(),
    isEnableModalOpen: false,
    openEnableModal: vi.fn(),
    closeEnableModal: vi.fn(),
    ...overrides,
  };
  return { value, ...render(
    <PushControlContext.Provider value={value}>
      <PushStatusIndicator />
    </PushControlContext.Provider>,
  ) };
}

describe('PushStatusIndicator', () => {
  it.each<PushState>(['off', 'blocked', 'ios-needs-install'])('is visible when %s', (state) => {
    renderIndicator({ state });
    expect(screen.getByTestId('push-status-indicator')).toBeInTheDocument();
  });

  it.each<PushState>(['on', 'loading', 'enabling', 'disabling', 'unsupported', 'unavailable'])(
    'is hidden when %s',
    (state) => {
      renderIndicator({ state });
      expect(screen.queryByTestId('push-status-indicator')).not.toBeInTheDocument();
    },
  );

  it('renders nothing when there is no provider (tolerant)', () => {
    render(<PushStatusIndicator />);
    expect(screen.queryByTestId('push-status-indicator')).not.toBeInTheDocument();
  });

  it('has a descriptive accessible label and opens the modal on click', async () => {
    const openEnableModal = vi.fn();
    renderIndicator({ state: 'off', openEnableModal });
    const button = screen.getByRole('button', {
      name: 'Notifications are off — tap to turn them on',
    });
    await userEvent.click(button);
    expect(openEnableModal).toHaveBeenCalledTimes(1);
  });
});
