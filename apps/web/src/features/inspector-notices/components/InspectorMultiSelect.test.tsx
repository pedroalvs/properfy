import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { InspectorMultiSelect } from './InspectorMultiSelect';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function Host({ initial = [] as string[] }) {
  const [ids, setIds] = useState<string[]>(initial);
  return <InspectorMultiSelect selectedIds={ids} onChange={setIds} />;
}

function inspectorsPage(rows: Array<{ id: string; name: string; email: string }>, page: number, totalPages: number) {
  return { data: { data: rows, pagination: { page, pageSize: 100, total: rows.length, totalPages } } };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('InspectorMultiSelect', () => {
  it('fetches every page and lists inspectors sorted by name', async () => {
    mockGet.mockImplementation((_path, init) => {
      const page = Number(init.params.query.page);
      return Promise.resolve(
        page === 1
          ? inspectorsPage([{ id: '1', name: 'Ana', email: 'a@x.io' }], 1, 2)
          : inspectorsPage([{ id: '2', name: 'Bob', email: 'b@x.io' }], 2, 2),
      );
    });
    render(<Host />, { wrapper: wrapper() });
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('filters by name or email, case-insensitive', async () => {
    mockGet.mockResolvedValue(
      inspectorsPage(
        [
          { id: '1', name: 'Ana', email: 'ana@x.io' },
          { id: '2', name: 'Bob', email: 'bob@x.io' },
        ],
        1,
        1,
      ),
    );
    render(<Host />, { wrapper: wrapper() });
    await screen.findByText('Ana');
    fireEvent.change(screen.getByPlaceholderText('Search inspectors'), { target: { value: 'BOB' } });
    await waitFor(() => expect(screen.queryByText('Ana')).not.toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('toggles a checkbox and reports the count', async () => {
    mockGet.mockResolvedValue(inspectorsPage([{ id: '1', name: 'Ana', email: 'a@x.io' }], 1, 1));
    render(<Host />, { wrapper: wrapper() });
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selects all shown then clears', async () => {
    mockGet.mockResolvedValue(
      inspectorsPage(
        [
          { id: '1', name: 'Ana', email: 'a@x.io' },
          { id: '2', name: 'Bob', email: 'b@x.io' },
        ],
        1,
        1,
      ),
    );
    render(<Host />, { wrapper: wrapper() });
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('shows the 500 cap error when the selection exceeds the limit', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: `i${i}`, name: `N${i}`, email: `n${i}@x.io` }));
    mockGet.mockResolvedValue(inspectorsPage(rows, 1, 1));
    render(<Host />, { wrapper: wrapper() });
    await screen.findByText('N0');
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(
      await screen.findByText('You can select up to 500 inspectors. Use All active inspectors or Region instead.'),
    ).toBeInTheDocument();
  });

  it('shows a load error with Retry', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'x' } }, response: { status: 500 } });
    render(<Host />, { wrapper: wrapper() });
    expect(await screen.findByText("Couldn't load inspectors.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('checkboxes are keyboard-reachable native inputs', async () => {
    mockGet.mockResolvedValue(inspectorsPage([{ id: '1', name: 'Ana', email: 'a@x.io' }], 1, 1));
    render(<Host />, { wrapper: wrapper() });
    await screen.findByText('Ana');
    const list = screen.getByRole('list');
    const checkbox = within(list).getByRole('checkbox');
    expect(checkbox).toHaveProperty('tagName', 'INPUT');
  });
});
