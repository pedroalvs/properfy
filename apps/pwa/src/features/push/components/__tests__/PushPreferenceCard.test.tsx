import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushPreferenceCard } from '../PushPreferenceCard';
import type { PushState, PushError } from '../../hooks/usePushSubscription';

vi.mock('../../hooks/useBrowserPushDeps', () => ({ useBrowserPushDeps: () => ({}) }));

const enable = vi.fn();
const disable = vi.fn();
const sub = vi.fn();
vi.mock('../../hooks/usePushSubscription', () => ({
  usePushSubscription: () => sub(),
}));

function set(state: PushState, error: PushError = null) {
  sub.mockReturnValue({ state, error, enable, disable });
}

describe('PushPreferenceCard', () => {
  beforeEach(() => {
    enable.mockReset();
    disable.mockReset();
    sub.mockReset();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('names the switch "Push notifications" and reflects the on state', () => {
    set('on');
    render(<PushPreferenceCard />);
    const toggle = screen.getByRole('switch', { name: 'Push notifications' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      "On for this device. You'll get announcements even when the app is closed.",
    );
  });

  it('shows the off copy and an unchecked, enabled switch', () => {
    set('off');
    render(<PushPreferenceCard />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).not.toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Get announcements on this device even when the app is closed.',
    );
  });

  it.each<[PushState, string]>([
    ['blocked', 'Notifications are blocked for Properfy. Turn them on in your device settings, then come back.'],
    ['ios-needs-install', 'To get push notifications on iPhone, add Properfy to your Home Screen (iOS 16.4 or later) and open it from there.'],
    ['unsupported', "This browser doesn't support push notifications."],
    ['unavailable', "Push notifications aren't available right now."],
    ['enabling', 'Turning on…'],
    ['disabling', 'Turning off…'],
  ])('renders %s copy with a disabled switch', (state, text) => {
    set(state);
    render(<PushPreferenceCard />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('shows a skeleton and no switch while loading', () => {
    set('loading');
    render(<PushPreferenceCard />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('calls enable when toggled on from off', async () => {
    set('off');
    render(<PushPreferenceCard />);
    await userEvent.click(screen.getByRole('switch'));
    expect(enable).toHaveBeenCalled();
  });

  it('calls disable when toggled off from on', async () => {
    set('on');
    render(<PushPreferenceCard />);
    await userEvent.click(screen.getByRole('switch'));
    expect(disable).toHaveBeenCalled();
  });

  it('shows an offline alert and does not enable when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    set('off');
    render(<PushPreferenceCard />);
    await userEvent.click(screen.getByRole('switch'));
    expect(enable).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're offline. Connect to turn on push notifications.",
    );
  });

  it('shows the save-failed alert', () => {
    set('off', 'save-failed');
    render(<PushPreferenceCard />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't turn on push notifications. Try again.",
    );
  });
});
