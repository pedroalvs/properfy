import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import { FinancialTable } from './FinancialTable';
import type { FinancialEntry } from '../types';

function makeEntry(overrides: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    id: 'fin-1',
    tenantId: 'tenant-1',
    appointmentCode: 'VIST-001',
    entryType: FinancialEntryType.TENANT_DEBIT,
    amount: -350,
    currency: 'AUD',
    status: FinancialEntryStatus.APPROVED,
    description: 'Inspection debit',
    relatedEntityName: 'Imobiliária Centro',
    effectiveAt: '2026-03-10T14:00:00Z',
    approvedByName: 'Admin Principal',
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

describe('FinancialTable', () => {
  it('renders column headers', () => {
    render(<FinancialTable data={[]} />);
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Entity')).toBeInTheDocument();
    expect(screen.getByText('Effective Date')).toBeInTheDocument();
  });

  it('renders data (appointmentCode, relatedEntityName)', () => {
    const entry = makeEntry();
    render(<FinancialTable data={[entry]} />);
    expect(screen.getByText('VIST-001')).toBeInTheDocument();
    expect(screen.getByText('Imobiliária Centro')).toBeInTheDocument();
  });

  it('renders FinancialEntryTypeChip for type', () => {
    const entry = makeEntry({ entryType: FinancialEntryType.REFUND });
    render(<FinancialTable data={[entry]} />);
    expect(screen.getByText('Refund')).toBeInTheDocument();
  });

  it('renders FinancialStatusChip for status', () => {
    const entry = makeEntry({ status: FinancialEntryStatus.PENDING });
    render(<FinancialTable data={[entry]} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders positive amount with green color', () => {
    const entry = makeEntry({ amount: 350 });
    render(<FinancialTable data={[entry]} />);
    const amountEl = screen.getByText(/350/);
    expect(amountEl.style.color).toBe('var(--color-money-positive)');
  });

  it('renders negative amount with red color', () => {
    const entry = makeEntry({ amount: -350 });
    render(<FinancialTable data={[entry]} />);
    const amountEl = screen.getByText(/350/);
    expect(amountEl.style.color).toBe('var(--color-money-negative)');
  });

  it('renders formatted amount with the row currency', () => {
    const entry = makeEntry({ amount: -350, currency: 'NZD' });
    render(<FinancialTable data={[entry]} />);
    const matches = screen.getAllByText((_content, element) => {
      return element?.textContent?.includes('350') && (element?.textContent?.includes('NZD') || element?.textContent?.includes('NZ$')) || false;
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted date for effectiveAt', () => {
    const entry = makeEntry({ effectiveAt: '2026-03-10T14:00:00Z' });
    render(<FinancialTable data={[entry]} />);
    expect(screen.getByText('10/03/2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<FinancialTable data={[]} loading />);
    expect(screen.getByText('Inspection')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<FinancialTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<FinancialTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct entry', async () => {
    const userEvt = userEvent.setup();
    const onView = vi.fn();
    const entry = makeEntry();
    render(<FinancialTable data={[entry]} onView={onView} />);
    await userEvt.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(entry);
  });

  it('row exposes only the View action — no Edit icon (FR-019b)', () => {
    const entry = makeEntry();
    render(<FinancialTable data={[entry]} onView={vi.fn()} />);
    expect(screen.getByLabelText('View')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });
});
