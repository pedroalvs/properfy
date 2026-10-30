import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useGoBack } from './useGoBack';

// Note: these tests drive the hook through MemoryRouter and stub `window.history.state`
// directly. `createBrowserRouter` is the only router that actually writes
// `window.history.state.idx`, but its data-router navigation path builds a `Request` whose
// jsdom `AbortSignal` is rejected by Node's undici, crashing the test. Writing `idx` into the
// real history (which the hook reads) and letting a MemoryRouter `replace` mint the fresh key
// reproduces every branch of the hook's logic without that framework machinery.

function BackHarness({ fallback = '/list' }: { fallback?: string }) {
  const goBack = useGoBack(fallback);
  return (
    <button type="button" onClick={goBack}>
      back
    </button>
  );
}

function ListHarness() {
  const navigate = useNavigate();
  return (
    <div>
      list page
      <button type="button" onClick={() => navigate('/detail')}>
        open detail
      </button>
    </div>
  );
}

// A detail page that performs a replace-navigation on mount. Under React Router 6.28 a
// `replace` mints a fresh `location.key` while leaving `history.state.idx` untouched — the
// exact situation the old key-based criterion got wrong.
function ReplacingDetail() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/detail?x=1', { replace: true });
  }, [navigate]);
  return <BackHarness />;
}

function renderMemoryAt(initialEntry: string, element = <BackHarness />) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[initialEntry]}
    >
      <Routes>
        <Route path="/detail" element={element} />
        <Route path="/list" element={<ListHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  // window.history is a single shared jsdom object; the browser-router test (G1) leaves an
  // `idx` behind that would flip the memory-router tests into the idx branch. Reset to null
  // so the key-fallback path is exercised where intended.
  window.history.replaceState(null, '', '/');
});

describe('useGoBack', () => {
  // G1 — the regression guard (L-X01-01). A replace on a first entry keeps idx === 0 but mints a
  // fresh location.key; the old key-based criterion wrongly chose navigate(-1). idx must win → fallback.
  it('G1: falls back when idx === 0 even after a replace minted a fresh key', () => {
    window.history.replaceState({ idx: 0 }, '', '/detail');
    renderMemoryAt('/detail', <ReplacingDetail />);
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // G2 — idx === 0 on a plain first entry (no replace) → fallback.
  it('G2: falls back when idx === 0 on a first entry', () => {
    window.history.replaceState({ idx: 0 }, '', '/detail');
    renderMemoryAt('/detail');
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // G3 — idx > 0 means the user arrived by an in-app push → navigate(-1). The memory router has
  // a single entry, so navigate(-1) is a no-op and the screen stays on /detail (it does NOT
  // fall back to /list).
  it('G3: navigates back when history.state.idx > 0', () => {
    window.history.replaceState({ idx: 2 }, '', '/detail');
    renderMemoryAt('/detail');
    fireEvent.click(screen.getByText('back'));
    expect(screen.queryByText('list page')).not.toBeInTheDocument();
    expect(screen.getByText('back')).toBeInTheDocument();
  });

  // G4 — no idx (memory router): in-app push, key !== 'default' → navigate(-1).
  it('G4: navigates back to the prior page when in-app history exists (key fallback)', () => {
    renderMemoryAt('/list');
    fireEvent.click(screen.getByText('open detail'));
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  // G5 — no idx (memory router): fresh direct entry, key === 'default' → fallback.
  it('G5: falls back when there is no in-app history (first entry, key fallback)', () => {
    renderMemoryAt('/detail');
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });
});
