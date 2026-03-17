import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { TenantContactDetailSections } from './TenantContactDetailSections';
import type { TenantContactDetail } from '../types';

const baseContact: TenantContactDetail = {
  id: 'tnt-01',
  appointmentId: 'apt-01',
  appointmentCode: 'VIST-101',
  name: 'Ana Silva',
  primaryEmail: 'ana.silva@email.com',
  primaryPhone: '11999000001',
  confirmationStatus: TenantConfirmationStatus.PENDING,
  propertyAddress: 'Rua Augusta, 1200 - Centro, São Paulo',
  appointmentDate: '2026-03-20T14:00:00Z',
  lastActivityAt: '2026-03-16T08:00:00Z',
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:00:00Z',
  notes: 'Tenant confirmed by email',
  alternativePhone: '11998000001',
};

describe('TenantContactDetailSections', () => {
  it('renders section titles', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Appointment')).toBeInTheDocument();
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders name and email', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('ana.silva@email.com')).toBeInTheDocument();
  });

  it('shows phone when present, em-dash when null', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('11999000001')).toBeInTheDocument();

    const noPhone = { ...baseContact, primaryPhone: null };
    const { container } = render(<TenantContactDetailSections contact={noPhone} />);
    const emDashes = container.querySelectorAll('span');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('shows alternativePhone when present, em-dash when null', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('11998000001')).toBeInTheDocument();
  });

  it('shows appointment code and property address', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('VIST-101')).toBeInTheDocument();
    expect(screen.getByText('Rua Augusta, 1200 - Centro, São Paulo')).toBeInTheDocument();
  });

  it('shows confirmation status chip', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows lastActivityAt when present, em-dash when null', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    const dateText = new Date('2026-03-16T08:00:00Z').toLocaleString('pt-BR');
    expect(screen.getByText(dateText)).toBeInTheDocument();

    const noActivity = { ...baseContact, lastActivityAt: null };
    render(<TenantContactDetailSections contact={noActivity} />);
  });

  it('shows notes section when present, hides when null', () => {
    render(<TenantContactDetailSections contact={baseContact} />);
    expect(screen.getByText('Observations')).toBeInTheDocument();
    expect(screen.getByText('Tenant confirmed by email')).toBeInTheDocument();

    const noNotes = { ...baseContact, notes: null };
    const { container } = render(<TenantContactDetailSections contact={noNotes} />);
    const sections = container.querySelectorAll('h3, h4');
    const titles = Array.from(sections).map((s) => s.textContent);
    expect(titles).not.toContain('Observations');
  });
});
