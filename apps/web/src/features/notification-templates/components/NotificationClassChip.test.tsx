import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationClassChip } from './NotificationClassChip';

describe('NotificationClassChip', () => {
  // Assert stable semantic hooks (label, data-variant, title) rather than the
  // concrete colour classes, so the chip can move to design tokens without the
  // test churning on every palette change.
  it('renders TRANSACTIONAL with its label and variant', () => {
    render(<NotificationClassChip notificationClass="TRANSACTIONAL" />);
    const chip = screen.getByText('Transactional');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-variant', 'TRANSACTIONAL');
  });

  it('renders OPERATIONAL with its label and variant', () => {
    render(<NotificationClassChip notificationClass="OPERATIONAL" />);
    const chip = screen.getByText('Operational');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-variant', 'OPERATIONAL');
  });

  it('renders MARKETING with its label and variant', () => {
    render(<NotificationClassChip notificationClass="MARKETING" />);
    const chip = screen.getByText('Marketing');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-variant', 'MARKETING');
  });

  it('has a descriptive title attribute for TRANSACTIONAL', () => {
    render(<NotificationClassChip notificationClass="TRANSACTIONAL" />);
    const chip = screen.getByText('Transactional');
    expect(chip.getAttribute('title')).toContain('cannot opt out');
  });

  it('accepts custom className prop', () => {
    render(<NotificationClassChip notificationClass="OPERATIONAL" className="extra-class" />);
    const chip = screen.getByText('Operational');
    expect(chip.className).toContain('extra-class');
  });
});
