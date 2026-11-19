import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReliabilityMetricFailure } from '@properfy/shared';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';
import { MetricFailures } from './MetricFailures';

const APPT = '77777777-7777-4777-8777-777777777777';
const twoFailures: ReliabilityMetricFailure[] = [
  { appointmentId: APPT, serviceDate: '2026-11-18', detail: 'Checked in 11:20, window 09:00–11:00, planned 10:50' },
  { appointmentId: APPT, serviceDate: '2026-11-12', detail: 'Checked in 10:05, window 09:00–11:00' },
];

describe('MetricFailures', () => {
  it('renders no button when there are no failures', () => {
    const { container } = render(<MetricFailures failures={[]} failureCount={0} />, {
      wrapper: createRouterQueryWrapper(),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('expands the issue list with an appointment link', () => {
    render(<MetricFailures failures={twoFailures} failureCount={2} />, { wrapper: createRouterQueryWrapper() });
    const toggle = screen.getByRole('button', { name: 'Show 2 issues' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('18/11/2026 · Checked in 11:20, window 09:00–11:00, planned 10:50')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Open appointment' });
    expect(links[0]).toHaveAttribute('href', `/appointments/${APPT}`);
  });

  it('shows the cap note when there are more than 20 failures', () => {
    const twenty: ReliabilityMetricFailure[] = Array.from({ length: 20 }, (_, i) => ({
      appointmentId: APPT,
      serviceDate: '2026-11-18',
      detail: `Issue ${i}`,
    }));
    render(<MetricFailures failures={twenty} failureCount={25} />, { wrapper: createRouterQueryWrapper() });
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 issues' }));
    expect(screen.getByText('Showing the 20 most recent of 25')).toBeInTheDocument();
  });
});
