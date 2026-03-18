import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InvoiceTable } from './InvoiceTable';
import type { Invoice } from '../types';

const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv-01',
    tenantId: 'tenant-01',
    inspectorId: 'insp-01',
    inspectorName: 'Diego',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-15',
    frequency: 'BIWEEKLY',
    totalAmount: 1800,
    currency: 'BRL',
    status: 'DRAFT',
    entryCount: 5,
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-16T10:00:00Z',
  },
  {
    id: 'inv-02',
    tenantId: 'tenant-01',
    inspectorId: 'insp-02',
    inspectorName: 'Carlos',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    frequency: 'MONTHLY',
    totalAmount: 3200,
    currency: 'BRL',
    status: 'SENT',
    entryCount: 12,
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-16T10:00:00Z',
  },
];

describe('InvoiceTable', () => {
  it('renders table headers', () => {
    render(<InvoiceTable data={[]} />);
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Period')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders invoice data', () => {
    render(<InvoiceTable data={MOCK_INVOICES} />);
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('renders frequency labels', () => {
    render(<InvoiceTable data={MOCK_INVOICES} />);
    expect(screen.getByText('Biweekly')).toBeInTheDocument();
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
