import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationClassChip } from './NotificationClassChip';

describe('NotificationClassChip', () => {
  it('renders TRANSACTIONAL with green style and correct label', () => {
    render(<NotificationClassChip notificationClass="TRANSACTIONAL" />);
    const chip = screen.getByText('Transactional');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-[#C8E6C9]');
  });

  it('renders OPERATIONAL with blue style', () => {
    render(<NotificationClassChip notificationClass="OPERATIONAL" />);
    const chip = screen.getByText('Operational');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-[#B3E5FC]');
  });

  it('renders MARKETING with gray style', () => {
    render(<NotificationClassChip notificationClass="MARKETING" />);
    const chip = screen.getByText('Marketing');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-gray-200');
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
