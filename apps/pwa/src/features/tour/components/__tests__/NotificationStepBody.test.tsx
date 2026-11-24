import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationStepBody } from '../NotificationStepBody';
import {
  PushControlContext,
  type PushControlValue,
} from '@/features/push/context/PushControlProvider';
import type { PushState } from '@/features/push/hooks/usePushSubscription';

function renderBody(overrides: Partial<PushControlValue> = {}) {
  const value: PushControlValue = {
    state: 'off',
    error: null,
    optedOut: false,
    enable: vi.fn(),
    disable: vi.fn(),
    requestEnable: vi.fn().mockResolvedValue(undefined),
    declinePersistently: vi.fn(),
    isEnableModalOpen: false,
    openEnableModal: vi.fn(),
    closeEnableModal: vi.fn(),
    ...overrides,
  };
  return {
    value,
    ...render(
      <PushControlContext.Provider value={value}>
        <NotificationStepBody />
      </PushControlContext.Provider>,
    ),
  };
}

describe('NotificationStepBody', () => {
  it('offers a "Turn on notifications" button that requests permission on the gesture', async () => {
    const requestEnable = vi.fn().mockResolvedValue(undefined);
    renderBody({ state: 'off', requestEnable });
    const button = screen.getByRole('button', { name: 'Turn on notifications' });
    await act(async () => {
      await userEvent.click(button);
    });
    expect(requestEnable).toHaveBeenCalledTimes(1);
  });

  it('shows the button while the push config is still loading', () => {
    renderBody({ state: 'loading' });
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('confirms when already on, with no button', () => {
    renderBody({ state: 'on' });
    expect(screen.getByText(/You're all set/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
  });

  it.each<[PushState, RegExp]>([
    ['blocked', /blocked for Properfy/i],
    ['ios-needs-install', /add Properfy to your Home Screen/i],
    ['unsupported', /doesn't support push notifications/i],
    ['unavailable', /aren't available right now/i],
  ])('shows guidance and no button when %s', (state, copy) => {
    renderBody({ state });
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
  });
});
