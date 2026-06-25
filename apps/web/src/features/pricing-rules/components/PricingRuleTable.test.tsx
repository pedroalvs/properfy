import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PricingRuleTable } from './PricingRuleTable';
import type { PricingRule } from '../types';

const MOCK_DATA: PricingRule[] = [
  { id: 'pr-01', tenantId: 'ten-1', currency: 'USD', tenantName: 'Imob Alpha', serviceTypeId: 'st-1', serviceTypeName: 'Routine', branchId: null, branchName: null, priceAmount: 150, payoutType: 'FIXED', payoutValue: 100, bonusRuleJson: null, status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'pr-02', tenantId: 'ten-2', currency: 'AUD', tenantName: 'Imob Beta', serviceTypeId: 'st-2', serviceTypeName: 'Outgoing', branchId: 'br-1', branchName: 'Downtown', priceAmount: 200, payoutType: 'PERCENTAGE', payoutValue: 70, bonusRuleJson: null, status: 'INACTIVE', createdAt: '2026-03-02T10:00:00Z', updatedAt: '2026-03-02T10:00:00Z' },
];

describe('PricingRuleTable', () => {
  it('renders column headers', () => {
    render(<PricingRuleTable data={[]} />);
    expect(screen.getByText('Agency')).toBeInTheDocument();
    expect(screen.getByText('Service Type')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Payout Type')).toBeInTheDocument();
    expect(screen.getByText('Payout Value')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders pricing rule data', () => {
    render(<PricingRuleTable data={MOCK_DATA} />);
    expect(screen.getByText('Imob Alpha')).toBeInTheDocument();
    expect(screen.getByText('Routine')).toBeInTheDocument();
    expect(screen.getByText('Downtown')).toBeInTheDocument();
    expect(screen.getByText(/USD\s*150\.00/)).toBeInTheDocument();
  });

  it('renders percentage payout with % symbol', () => {
    render(<PricingRuleTable data={MOCK_DATA} />);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('renders edit action buttons', () => {
    const onEdit = vi.fn();
    render(<PricingRuleTable data={MOCK_DATA} onEdit={onEdit} />);
    const editButtons = screen.getAllByLabelText('Edit');
    expect(editButtons).toHaveLength(2);
  });
});
