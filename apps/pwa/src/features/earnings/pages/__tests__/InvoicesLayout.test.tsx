import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { InvoicesLayout } from '../InvoicesLayout';

// InvoiceListPage has its own data hooks; stub it so the test focuses on the two-pane wiring.
vi.mock('../InvoiceListPage', () => ({
  InvoiceListPage: () => <div data-testid="invoices-master">list</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderAt(path: string) {
  const routes: RouteObject[] = [
    {
      path: 'earnings/invoices',
      element: <InvoicesLayout />,
      children: [
        { index: true, element: null },
        { path: ':invoiceId', element: <div data-testid="invoice-detail">detail</div> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  });
  return render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

describe('InvoicesLayout', () => {
  it('shows only the invoice list (collapsed detail) at /earnings/invoices', () => {
    renderAt('/earnings/invoices');
    expect(screen.getByTestId('invoices-master')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-0');
  });

  it('keeps the list mounted and expands the detail at /earnings/invoices/:id', () => {
    renderAt('/earnings/invoices/inv-1');
    expect(screen.getByTestId('invoices-master')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-detail')).toBeInTheDocument();
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-[58%]');
  });

  it('navigates back to the list when the frame close is used', async () => {
    mockNavigate.mockClear();
    const user = userEvent.setup();
    renderAt('/earnings/invoices/inv-1');
    await user.click(screen.getByTestId('two-pane-close'));
    expect(mockNavigate).toHaveBeenCalledWith('/earnings/invoices', { replace: true });
  });
});
