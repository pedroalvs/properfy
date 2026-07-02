import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceTable } from './InvoiceTable';
import type { Invoice } from '../types';

const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv-01',
    inspectorId: 'insp-01',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-15',
    invoiceNumber: null,    invoiceNumberDisplay: null,    periodType: 'FORTNIGHTLY',
    totalAmount: 1800,
    currency: 'AUD',
    status: 'CLOSED',
    fileKey: 'invoices/inv-01.pdf',
    issuedAt: '2026-03-16T10:00:00Z',
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-16T10:00:00Z',
  },
  {
    id: 'inv-02',
    inspectorId: 'insp-02',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    invoiceNumber: null,    invoiceNumberDisplay: null,    periodType: 'MONTHLY',
    totalAmount: 3200,
    currency: 'AUD',
    status: 'PAID',
    fileKey: 'invoices/inv-02.pdf',
    issuedAt: '2026-03-16T10:00:00Z',
    paidAt: '2026-03-20T10:00:00Z',
    paidByUserId: 'user-01',
    paymentReference: 'PAY-001',
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-16T10:00:00Z',
  },
];

describe('InvoiceTable', () => {
  it('renders table headers', () => {
    render(<InvoiceTable data={[]} />);
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Period')).toBeInTheDocument();
    expect(screen.getByText('Period Type')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders invoice data', () => {
    render(<InvoiceTable data={MOCK_INVOICES} resolveInspectorLabel={(id) => (id === 'insp-01' ? 'Diego' : 'Carlos')} />);
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('renders period type labels', () => {
    render(<InvoiceTable data={MOCK_INVOICES} />);
    expect(screen.getByText('Fortnightly')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    const onView = vi.fn();
    const onDownload = vi.fn();
    render(<InvoiceTable data={MOCK_INVOICES} onView={onView} onDownload={onDownload} />);

    const viewButtons = screen.getAllByLabelText('View');
    expect(viewButtons.length).toBe(2);

    const downloadButtons = screen.getAllByLabelText('Download');
    expect(downloadButtons.length).toBe(2);
  });
});
