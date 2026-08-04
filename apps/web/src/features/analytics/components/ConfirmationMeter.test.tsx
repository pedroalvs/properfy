import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmationMeter } from './ConfirmationMeter';

describe('ConfirmationMeter', () => {
  it('renders the rate and the counts behind it', () => {
    render(<ConfirmationMeter confirmationRate={{ confirmed: 156, eligible: 200 }} />);
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByText('156 of 200 services')).toBeInTheDocument();
  });

  it('exposes the meter role with the value for assistive tech', () => {
    render(<ConfirmationMeter confirmationRate={{ confirmed: 1, eligible: 4 }} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '25');
    expect(meter).toHaveAccessibleName('Tenant confirmation rate: 1 of 4 services confirmed');
  });

  it('shows a dash rather than 0% when nothing required confirmation', () => {
    render(<ConfirmationMeter confirmationRate={{ confirmed: 0, eligible: 0 }} />);
    // 0/0 is not 0% — it is "the question did not apply this period".
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText(/no service in this period required tenant confirmation/i)).toBeInTheDocument();
  });

  it('renders a genuine 0% when services were eligible and none confirmed', () => {
    render(<ConfirmationMeter confirmationRate={{ confirmed: 0, eligible: 40 }} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders a full meter at 100%', () => {
    render(<ConfirmationMeter confirmationRate={{ confirmed: 40, eligible: 40 }} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
