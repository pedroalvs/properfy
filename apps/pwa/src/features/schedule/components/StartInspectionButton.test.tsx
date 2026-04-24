import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StartInspectionButton } from './StartInspectionButton';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('StartInspectionButton', () => {
  it('enables button for past-due SCHEDULED appointment', () => {
    wrap(<StartInspectionButton appointmentId="id" scheduledDate="2026-01-01" timeSlot="08:00-12:00" />);
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('shows overdue sublabel for past-due appointment', () => {
    wrap(<StartInspectionButton appointmentId="id" scheduledDate="2026-01-01" timeSlot="08:00-12:00" />);
    expect(screen.getByTestId('start-inspection-sublabel').textContent).toMatch(/overdue|past|complete/i);
  });

  it('disables button for future appointment', () => {
    wrap(<StartInspectionButton appointmentId="id" scheduledDate="2099-01-01" timeSlot="08:00-12:00" />);
    expect(screen.getByTestId('start-inspection-button')).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel').textContent).toMatch(/inspection day/i);
  });
});
