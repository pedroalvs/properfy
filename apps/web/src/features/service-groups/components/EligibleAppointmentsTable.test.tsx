import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EligibleAppointmentsTable, type EligibleAppointment } from './EligibleAppointmentsTable';

vi.mock('@/lib/format-date', () => ({
  formatDate: (d: string) => d,
  formatDateTime: (d: string) => d,
}));

vi.mock('@/lib/status-colors', () => ({
  APPOINTMENT_STATUS_MAP: {
    AWAITING_INSPECTOR: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    SCHEDULED: { bg: '#B3E5FC', text: '#000', label: 'Scheduled' },
    DONE: { bg: '#C8E6C9', text: '#000', label: 'Done' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Cancelled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
}));

const MOCK_APPOINTMENTS: EligibleAppointment[] = [
  { id: 'apt-01', code: 'VST-001', propertyAddress: '123 Main St', scheduledDate: '2026-04-01', status: 'AWAITING_INSPECTOR' },
  { id: 'apt-02', code: 'VST-002', propertyAddress: '456 Oak Ave', scheduledDate: '2026-04-02', status: 'AWAITING_INSPECTOR' },
  { id: 'apt-03', code: 'VST-003', propertyAddress: '789 Pine Rd', scheduledDate: '2026-04-03', status: 'AWAITING_INSPECTOR' },
];

describe('EligibleAppointmentsTable', () => {
  it('renders all appointments', () => {
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByText('VST-001')).toBeInTheDocument();
    expect(screen.getByText('VST-002')).toBeInTheDocument();
    expect(screen.getByText('VST-003')).toBeInTheDocument();
  });

  it('shows addresses in table', () => {
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave')).toBeInTheDocument();
  });

  it('renders checkboxes with correct state', () => {
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={['apt-01']}
        onSelectionChange={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText('Select VST-001') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    const checkbox2 = screen.getByLabelText('Select VST-002') as HTMLInputElement;
    expect(checkbox2.checked).toBe(false);
  });

  it('calls onSelectionChange when toggling a checkbox', () => {
    const onChange = vi.fn();
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={['apt-01']}
        onSelectionChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select VST-002'));
    expect(onChange).toHaveBeenCalledWith(['apt-01', 'apt-02']);
  });

  it('deselects when clicking a selected checkbox', () => {
    const onChange = vi.fn();
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={['apt-01', 'apt-02']}
        onSelectionChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select VST-001'));
    // Deselecting apt-01 should return only apt-02
    expect(onChange).toHaveBeenCalledWith(['apt-02']);
  });

  it('select all toggles all appointments', () => {
    const onChange = vi.fn();
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={[]}
        onSelectionChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select all appointments'));
    expect(onChange).toHaveBeenCalledWith(['apt-01', 'apt-02', 'apt-03']);
  });

  it('deselect all when all are selected', () => {
    const onChange = vi.fn();
    render(
      <EligibleAppointmentsTable
        appointments={MOCK_APPOINTMENTS}
        selectedIds={['apt-01', 'apt-02', 'apt-03']}
        onSelectionChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select all appointments'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows empty message when no appointments', () => {
    render(
      <EligibleAppointmentsTable
        appointments={[]}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByText('No eligible appointments found')).toBeInTheDocument();
  });
});
