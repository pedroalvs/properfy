import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import { FinancialEntryDetailSections } from './FinancialEntryDetailSections';
import type { FinancialEntryDetail } from '../types';

const baseEntry: FinancialEntryDetail = {
  id: 'fin-01',
  tenantId: 't-1',
  appointmentCode: 'VIST-001',
  entryType: FinancialEntryType.TENANT_DEBIT,
  amount: -350,
  currency: 'AUD',
  status: FinancialEntryStatus.APPROVED,
  description: 'Débito vistoria residencial Centro',
  relatedEntityName: 'Imobiliária Centro',
  effectiveAt: '2026-03-15T00:00:00Z',
  approvedByName: 'Admin Principal',
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:00:00Z',
  notes: 'Conferido e aprovado pelo operador',
  approvedAt: '2026-03-15T10:30:00Z',
  referenceNumber: 'REF-001',
};

describe('FinancialEntryDetailSections', () => {
  it('renders section titles', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Values')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders appointment code and description', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    expect(screen.getByText('VIST-001')).toBeInTheDocument();
    expect(screen.getByText('Débito vistoria residencial Centro')).toBeInTheDocument();
  });

  it('shows entry type chip and status chip', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    expect(screen.getByText('Tenant Debit')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('shows amount formatted with the entry currency', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    const matches = screen.getAllByText((_content, element) => {
      return element?.textContent?.includes('350') && (element?.textContent?.includes('A$') || element?.textContent?.includes('AUD')) || false;
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows pending approval state instead of approval metadata for pending entries', () => {
    render(
      <FinancialEntryDetailSections
        entry={{ ...baseEntry, status: FinancialEntryStatus.PENDING, approvedByName: null, approvedAt: null }}
      />,
    );

    expect(screen.getByText('Pending financial approval')).toBeInTheDocument();
    expect(screen.queryByText('Approved By')).not.toBeInTheDocument();
    expect(screen.queryByText('Approved At')).not.toBeInTheDocument();
  });

  it('shows approved by name when present, em-dash when null', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    const matches = screen.getAllByText('Admin Principal');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    const noApprover = { ...baseEntry, approvedByName: null };
    render(<FinancialEntryDetailSections entry={noApprover} />);
  });

  it('shows reference number when present, em-dash when null', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    expect(screen.getByText('REF-001')).toBeInTheDocument();
  });

  it('shows notes section when present, hides when null', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    const notesMatches = screen.getAllByText('Notes');
    expect(notesMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Conferido e aprovado pelo operador')).toBeInTheDocument();

    const noNotes = { ...baseEntry, notes: null };
    const { container } = render(<FinancialEntryDetailSections entry={noNotes} />);
    const sections = container.querySelectorAll('h3, h4');
    const titles = Array.from(sections).map((s) => s.textContent);
    expect(titles).not.toContain('Notes');
  });

  it('renders createdAt and updatedAt', () => {
    render(<FinancialEntryDetailSections entry={baseEntry} />);
    const created = new Date('2026-03-15T10:00:00Z').toLocaleString('en-AU');
    const matches = screen.getAllByText(created);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
