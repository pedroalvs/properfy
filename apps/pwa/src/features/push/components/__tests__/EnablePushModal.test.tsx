import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnablePushModal } from '../EnablePushModal';
import { PushControlContext, type PushControlValue } from '../../context/PushControlProvider';

function renderModal(overrides: Partial<PushControlValue> = {}) {
  const value: PushControlValue = {
    state: 'off',
    error: null,
    optedOut: false,
    enable: vi.fn(),
    disable: vi.fn(),
    requestEnable: vi.fn(),
    declinePersistently: vi.fn(),
    isEnableModalOpen: true,
    openEnableModal: vi.fn(),
    closeEnableModal: vi.fn(),
    ...overrides,
  };
  return {
    value,
    ...render(
      <PushControlContext.Provider value={value}>
        <EnablePushModal />
      </PushControlContext.Provider>,
    ),
  };
}

describe('EnablePushModal', () => {
  it('is not rendered when closed', () => {
    renderModal({ isEnableModalOpen: false });
    expect(screen.queryByTestId('enable-push-modal')).not.toBeInTheDocument();
  });

  it('shows the enable question with the benefit copy when off', () => {
    renderModal({ state: 'off' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Turn on notifications?')).toBeInTheDocument();
    expect(
      screen.getByText(/day plans, route changes and announcements even when the app is closed/i),
    ).toBeInTheDocument();
  });

  it('requests enable on the colored "Turn on" (Yes) button', async () => {
    const requestEnable = vi.fn();
    renderModal({ state: 'off', requestEnable });
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(requestEnable).toHaveBeenCalledTimes(1);
  });

  it('persists the opt-out on "Not now"', async () => {
    const declinePersistently = vi.fn();
    renderModal({ state: 'off', declinePersistently });
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(declinePersistently).toHaveBeenCalledTimes(1);
  });

  it('shows the device-settings guidance and no "Turn on" when blocked', () => {
    renderModal({ state: 'blocked' });
    expect(
      screen.getByText(/Notifications are blocked for Properfy\. Turn them on in your device settings/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('shows the add-to-Home-Screen guidance when iOS needs install', () => {
    renderModal({ state: 'ios-needs-install' });
    expect(screen.getByText(/add Properfy to your Home Screen/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
  });
});
