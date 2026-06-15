import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useGoBack } from './useGoBack';

function DetailHarness() {
  const goBack = useGoBack('/list');
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

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/detail" element={<DetailHarness />} />
        <Route path="/list" element={<ListHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useGoBack', () => {
  it('falls back to the provided path when there is no in-app history', () => {
    // Detail is the initial entry → location.key === 'default' (fresh tab / direct load).
    renderAt('/detail');
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  it('navigates back to the prior page when in-app history exists', () => {
    renderAt('/list'); // start on the list
    fireEvent.click(screen.getByText('open detail')); // push → detail, key !== 'default'
    fireEvent.click(screen.getByText('back')); // navigate(-1)
    expect(screen.getByText('list page')).toBeInTheDocument();
  });
});
