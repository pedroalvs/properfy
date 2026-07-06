import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupSummaryCard } from './GroupSummaryCard';

describe('GroupSummaryCard', () => {
  it('renders appointment count', () => {
    render(
      <GroupSummaryCard
        appointmentCount={12}
        serviceType="Inspection"
        scheduledDate="2026-04-10"
        timeWindow="08:00 - 17:00"
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders service type', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Full Inspection"
        scheduledDate="2026-04-10"
        timeWindow="08:00 - 17:00"
      />,
    );
    expect(screen.getByText('Full Inspection')).toBeInTheDocument();
  });

  it('renders time window', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Inspection"
        scheduledDate="2026-04-10"
        timeWindow="09:00 - 18:00"
      />,
    );
    expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument();
  });

  it('shows title', () => {
    render(
      <GroupSummaryCard
        appointmentCount={0}
        serviceType=""
        scheduledDate=""
        timeWindow=""
      />,
    );
    expect(screen.getByText('Group Summary')).toBeInTheDocument();
  });

  it('shows dash for empty service type', () => {
    render(
      <GroupSummaryCard
        appointmentCount={0}
        serviceType=""
        scheduledDate=""
        timeWindow=""
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders scheduled date', () => {
    render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Inspection"
        scheduledDate="2026-04-10"
        timeWindow="08:00 - 17:00"
      />,
    );
    expect(screen.getByText('2026-04-10')).toBeInTheDocument();
  });

  it('uses a stacked mobile layout for summary fields', () => {
    const { container } = render(
      <GroupSummaryCard
        appointmentCount={5}
        serviceType="Inspection"
        scheduledDate="2026-04-10"
        timeWindow="08:00 - 17:00"
      />,
    );
    const grid = container.querySelector('.grid.grid-cols-1.sm\\:grid-cols-2');
    expect(grid).toBeTruthy();
  });
});
