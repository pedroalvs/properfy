import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwUpdatePrompt } from '../SwUpdatePrompt';

describe('SwUpdatePrompt', () => {
  const originalServiceWorker = navigator.serviceWorker;

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it('shows update prompt when a waiting worker already exists', async () => {
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
      installing: null,
      addEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration;

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(registration),
        controller: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });

    render(<SwUpdatePrompt />);

    expect(await screen.findByTestId('sw-update-prompt')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('stays hidden when there is no waiting worker and no new install', async () => {
    const registration = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration;

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(registration),
        controller: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });

    render(<SwUpdatePrompt />);

    await waitFor(() => expect(registration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function)));
    expect(screen.queryByTestId('sw-update-prompt')).not.toBeInTheDocument();
  });
});
