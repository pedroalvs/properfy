import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupSummaryCard } from './GroupSummaryCard';

vi.mock('@/lib/status-colors', () => ({
  PRIORITY_MODE_MAP: {
    STANDARD: { bg: '#eee', text: '#000', label: 'Standard' },
    PRIORITY_24H: { bg: '#ff0', text: '#000', label: '24h Priority' },
  },
}));

describe('GroupSummaryCard', () => {
  it('renders appointment count', () => {
    render(
      <GroupSummaryCard
        appointmentCount={12}
        serviceType="Inspection"
        timeWindow="08:00 - 17:00"
        priorityMode="STANDARD"
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders service type', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Full Inspection"
        timeWindow="08:00 - 17:00"
        priorityMode="STANDARD"
      />,
    );
    expect(screen.getByText('Full Inspection')).toBeInTheDocument();
  });

  it('renders time window', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Inspection"
        timeWindow="09:00 - 18:00"
        priorityMode="STANDARD"
      />,
    );
    expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument();
  });

  it('renders priority mode chip', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Inspection"
        timeWindow="08:00 - 17:00"
        priorityMode="PRIORITY_24H"
      />,
    );
    expect(screen.getByText('24h Priority')).toBeInTheDocument();
  });

  it('shows title', () => {
    render(
      <GroupSummaryCard
        appointmentCount={0}
        serviceType=""
        timeWindow=""
        priorityMode="STANDARD"
      />,
    );
    expect(screen.getByText('Group Summary')).toBeInTheDocument();
  });

  it('shows dash for empty service type', () => {
    render(
      <GroupSummaryCard
        appointmentCount={0}
        serviceType=""
        timeWindow=""
        priorityMode="STANDARD"
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});
