import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTour } from '../AppTour';
import { resolveTourSteps, type TourStep } from '../../lib/tour-steps';

// Control the install step's platform copy.
const installState = {
  isInstalled: false,
  canInstall: true,
  isIosSafariEligible: false,
  manualInstructions: 'Open in Chrome to install.',
  promptInstall: vi.fn(async () => true),
};
vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => installState,
  getIsStandalone: () => false,
}));

const ANCHORS = [
  'nav-today',
  'today-next',
  'today-next-actions',
  'today-more-actions',
  'today-route-link',
  'nav-schedule',
  'nav-offers',
  'nav-more',
];

function setRect(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 20, top: 100, width: 120, height: 44, right: 140, bottom: 144, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
  el.scrollIntoView = vi.fn();
}

function mountAnchors(keys: string[]) {
  for (const key of keys) {
    const el = document.createElement('a');
    el.setAttribute('data-tour', key);
    el.textContent = key;
    setRect(el);
    document.body.appendChild(el);
  }
}

function browserSteps(): TourStep[] {
  return resolveTourSteps({ isStandalone: false });
}
function standaloneSteps(): TourStep[] {
  return resolveTourSteps({ isStandalone: true });
}

function Harness({ steps, onFinish }: { steps: TourStep[]; onFinish: (r: 'completed' | 'skipped') => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <AppTour
      steps={steps}
      onFinish={(r) => {
        onFinish(r);
        setOpen(false);
      }}
    />
  );
}

beforeEach(() => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  installState.canInstall = true;
  installState.isIosSafariEligible = false;
  installState.promptInstall = vi.fn(async () => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('AppTour', () => {
  it('opens as a labelled modal dialog, focuses Next, and makes #root inert', async () => {
    mountAnchors(ANCHORS);
    render(<Harness steps={browserSteps()} onFinish={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Today' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    const root = document.getElementById('root')!;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.hasAttribute('inert')).toBe(true);
  });

  it('shows the step counter in a polite live region (9 in a browser)', async () => {
    mountAnchors(ANCHORS);
    render(<Harness steps={browserSteps()} onFinish={vi.fn()} />);
    const counter = await screen.findByText('Step 1 of 9');
    expect(counter).toHaveAttribute('aria-live', 'polite');
  });

  it('shows 8 steps in standalone', async () => {
    mountAnchors(ANCHORS);
    render(<Harness steps={standaloneSteps()} onFinish={vi.fn()} />);
    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument();
  });

  it('advances with Next and disables Back on the first step', async () => {
    mountAnchors(ANCHORS);
    render(<Harness steps={browserSteps()} onFinish={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Today' });
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'Next inspection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Today' })).toBeInTheDocument();
  });

  it('shows Done on the last step and completes', async () => {
    mountAnchors(ANCHORS);
    const onFinish = vi.fn();
    render(<Harness steps={standaloneSteps()} onFinish={onFinish} />);
    await screen.findByRole('dialog', { name: 'Today' });
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next|Done/ }));
    }
    const done = await screen.findByRole('button', { name: 'Done' });
    fireEvent.click(done);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('completed');
  });

  it('skips on the Skip button, removes inert and restores focus', async () => {
    mountAnchors(ANCHORS);
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    const onFinish = vi.fn();
    render(<Harness steps={browserSteps()} onFinish={onFinish} />);
    await screen.findByRole('dialog', { name: 'Today' });

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('skipped');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const root = document.getElementById('root')!;
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root).not.toHaveAttribute('aria-hidden');
    expect(opener).toHaveFocus();
  });

  it('treats Escape as Skip', async () => {
    mountAnchors(ANCHORS);
    const onFinish = vi.fn();
    render(<Harness steps={browserSteps()} onFinish={onFinish} />);
    const dialog = await screen.findByRole('dialog', { name: 'Today' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('skipped');
  });

  it('skips an absent target step and recomputes the total', async () => {
    // today-more-actions (step 4) is absent; all others present.
    mountAnchors(ANCHORS.filter((a) => a !== 'today-more-actions'));
    render(<Harness steps={browserSteps()} onFinish={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Today' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Next inspection' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Navigate and check in' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // The absent step 4 settles after the ~500ms wait and is skipped → "Your route".
    await screen.findByRole('dialog', { name: 'Your route' }, { timeout: 2000 });
    expect(screen.getByText('Step 4 of 8')).toBeInTheDocument();
  });

  it('shows only the install step when every target is absent', async () => {
    vi.useFakeTimers();
    try {
      // No anchors mounted at all.
      const onFinish = vi.fn();
      render(<Harness steps={browserSteps()} onFinish={onFinish} />);
      // Each absent step settles after its own 500ms wait; advance step-by-step so
      // the next step's timeout is scheduled before the next advance.
      for (let i = 0; i < 9; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600);
        });
      }
      expect(screen.getByRole('dialog', { name: 'Install Properfy' })).toBeInTheDocument();
      expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('completes without rendering when standalone and all targets are absent', async () => {
    vi.useFakeTimers();
    try {
      const onFinish = vi.fn();
      render(<Harness steps={standaloneSteps()} onFinish={onFinish} />);
      for (let i = 0; i < 9; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600);
        });
      }
      expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('completed');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not navigate or close on an overlay click', async () => {
    mountAnchors(ANCHORS);
    const onFinish = vi.fn();
    render(<Harness steps={browserSteps()} onFinish={onFinish} />);
    await screen.findByRole('dialog', { name: 'Today' });
    fireEvent.click(screen.getByTestId('tour-overlay'));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Today' })).toBeInTheDocument();
  });

  describe('install step', () => {
    async function gotoInstall() {
      mountAnchors(ANCHORS);
      render(<Harness steps={browserSteps()} onFinish={vi.fn()} />);
      await screen.findByRole('dialog', { name: 'Today' });
      for (let i = 0; i < 8; i++) {
        fireEvent.click(screen.getByRole('button', { name: /Next|Done/ }));
      }
      return screen.findByRole('dialog', { name: 'Install Properfy' });
    }

    it('shows iOS Share / Add to Home Screen instructions without an install button', async () => {
      installState.isIosSafariEligible = true;
      installState.canInstall = false;
      await gotoInstall();
      expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
    });

    it('offers an install button on Android and confirms installed', async () => {
      installState.isIosSafariEligible = false;
      installState.canInstall = true;
      await gotoInstall();
      const installBtn = screen.getByRole('button', { name: 'Install app' });
      await act(async () => {
        fireEvent.click(installBtn);
      });
      expect(installState.promptInstall).toHaveBeenCalledOnce();
      expect(await screen.findByText(/Installed/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    it('falls back to manual instructions', async () => {
      installState.isIosSafariEligible = false;
      installState.canInstall = false;
      await gotoInstall();
      expect(screen.getByText('Open in Chrome to install.')).toBeInTheDocument();
    });
  });
});
