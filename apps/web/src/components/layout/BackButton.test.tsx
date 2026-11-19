import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { BackButton } from './BackButton';

// MemoryRouter + Routes (not createMemoryRouter) — the data router's navigation path builds a
// Request whose jsdom AbortSignal is rejected by Node's undici; this exercises the same behaviour
// without that machinery.

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function ListPage() {
  const navigate = useNavigate();
  return (
    <div>
      <span>list page</span>
      <button type="button" onClick={() => navigate('/detail')}>
        open detail
      </button>
      <LocationProbe />
    </div>
  );
}

function renderAt(
  initialEntry: string,
  props: { to?: string; onClick?: (goBack: () => void) => void } = {},
) {
  const { to = '/list', onClick } = props;
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/detail"
          element={
            <>
              <span>detail page</span>
              <BackButton to={to} onClick={onClick} />
              <LocationProbe />
            </>
          }
        />
        <Route path="/list" element={<ListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('BackButton', () => {
  // B1 — direct entry → fallback.
  it('B1: navigates to the fallback on a direct entry', async () => {
    const user = userEvent.setup();
    renderAt('/detail');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // B2 — in-app history → previous screen.
  it('B2: goes back to the previous screen when history exists', async () => {
    const user = userEvent.setup();
    renderAt('/list');
    await user.click(screen.getByRole('button', { name: 'open detail' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // B3 — fallback preserves the query of the `to` prop.
  it('B3: preserves the query string of the fallback target', async () => {
    const user = userEvent.setup();
    renderAt('/detail', { to: '/list?tab=x' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/list?tab=x');
  });

  // B4 — onClick override is called with a function and the button does not navigate itself.
  it('B4: calls the onClick override with goBack and does not navigate', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderAt('/detail', { onClick });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.any(Function));
    expect(screen.getByText('detail page')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/detail');
  });

  // B4b — the goBack passed to the override uses the same fallback.
  it('B4b: the goBack handed to onClick navigates to the fallback', async () => {
    const user = userEvent.setup();
    renderAt('/detail', { to: '/list', onClick: (goBack) => goBack() });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // B5 — markup: a button named "Back" with visible text and a hidden icon.
  it('B5: renders a button with visible "Back" text and an aria-hidden icon', () => {
    const { container } = renderAt('/detail');
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByText('Back')).toBeInTheDocument();
    const icon = container.querySelector('i.mdi-arrow-left');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  // B6 — keyboard: Tab focuses the button, Enter activates.
  it('B6: is reachable by Tab and activates on Enter', async () => {
    const user = userEvent.setup();
    renderAt('/detail');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // B7 — keyboard: Space activates.
  it('B7: activates on Space', async () => {
    const user = userEvent.setup();
    renderAt('/detail');
    screen.getByRole('button', { name: 'Back' }).focus();
    await user.keyboard(' ');
    expect(screen.getByText('list page')).toBeInTheDocument();
  });
});
