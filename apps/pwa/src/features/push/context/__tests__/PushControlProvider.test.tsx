import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const enable = vi.fn().mockResolvedValue(undefined);
const disable = vi.fn().mockResolvedValue(undefined);
// Stateful opt-out store so `optedOut` (derived live via getOptOut on each render)
// reflects what setOptOut wrote.
let optedOutStore = false;
const setOptOut = vi.fn((v: boolean) => {
  optedOutStore = v;
});
const getOptOut = vi.fn(() => optedOutStore);

vi.mock('../../hooks/useBrowserPushDeps', () => ({
  useBrowserPushDeps: () => ({ getOptOut, setOptOut }),
}));
vi.mock('../../hooks/usePushSubscription', () => ({
  usePushSubscription: () => ({ state: 'off', error: null, enable, disable }),
}));

import { PushControlProvider, usePushControl } from '../PushControlProvider';

function Probe() {
  const push = usePushControl();
  return (
    <div>
      <span data-testid="state">{push.state}</span>
      <span data-testid="opted-out">{String(push.optedOut)}</span>
      <span data-testid="modal-open">{String(push.isEnableModalOpen)}</span>
      <button onClick={push.openEnableModal}>open</button>
      <button onClick={push.closeEnableModal}>close</button>
      <button onClick={() => void push.requestEnable()}>request-enable</button>
      <button onClick={push.declinePersistently}>decline</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <PushControlProvider>
      <Probe />
    </PushControlProvider>,
  );
}

describe('PushControlProvider', () => {
  beforeEach(() => {
    enable.mockClear();
    disable.mockClear();
    setOptOut.mockClear();
    getOptOut.mockClear();
    optedOutStore = false;
  });

  it('exposes the subscription state and starts with the modal closed', () => {
    renderProvider();
    expect(screen.getByTestId('state')).toHaveTextContent('off');
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false');
    expect(screen.getByTestId('opted-out')).toHaveTextContent('false');
  });

  it('opens and closes the enable modal', async () => {
    renderProvider();
    await userEvent.click(screen.getByText('open'));
    expect(screen.getByTestId('modal-open')).toHaveTextContent('true');
    await userEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false');
  });

  it('requestEnable enables and closes the modal', async () => {
    renderProvider();
    await userEvent.click(screen.getByText('open'));
    await act(async () => {
      await userEvent.click(screen.getByText('request-enable'));
    });
    expect(enable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false');
    expect(screen.getByTestId('opted-out')).toHaveTextContent('false');
  });

  it('declinePersistently persists the opt-out and closes the modal', async () => {
    renderProvider();
    await userEvent.click(screen.getByText('open'));
    await userEvent.click(screen.getByText('decline'));
    expect(setOptOut).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('opted-out')).toHaveTextContent('true');
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false');
  });

  it('throws when usePushControl is used without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/within a PushControlProvider/);
    spy.mockRestore();
  });
});
