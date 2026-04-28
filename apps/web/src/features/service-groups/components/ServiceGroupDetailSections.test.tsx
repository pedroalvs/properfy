import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ServiceGroupStatus, PriorityMode } from '@properfy/shared';
import { ServiceGroupDetailSections } from './ServiceGroupDetailSections';
import type { ServiceGroupDetail, ServiceGroupAppointment } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeAppointment(overrides: Partial<ServiceGroupAppointment> = {}): ServiceGroupAppointment {
  return {
    id: 'apt-01',
    appointmentNumber: 1001,
    status: 'DRAFT',
    scheduledDate: '2026-03-10',
    propertyAddress: '123 Main St, Sydney',
    propertyCode: 'PROP-001',
    ...overrides,
  };
}

function makeServiceGroup(overrides: Partial<ServiceGroupDetail> = {}): ServiceGroupDetail {
  return {
    id: 'sg-01',
    tenantId: 't-1',
    name: 'Zona Sul SP',
    regionName: 'São Paulo - Sul',
    inspectorId: 'insp-01',
    inspectorName: 'Carlos Silva',
    status: ServiceGroupStatus.PUBLISHED,
    priorityMode: PriorityMode.STANDARD,
    appointmentsCount: 3,
    appointments: [
      makeAppointment({ id: 'apt-01', appointmentNumber: 1001 }),
      makeAppointment({ id: 'apt-02', appointmentNumber: 1002, propertyAddress: '456 Oak Ave, Melbourne' }),
      makeAppointment({ id: 'apt-03', appointmentNumber: 1003, propertyAddress: '789 Pine Rd, Brisbane' }),
    ],
    description: 'Operational group south region',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ServiceGroupDetailSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section titles', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Appointments (3)')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders name and region', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Zona Sul SP')).toBeInTheDocument();
    expect(screen.getByText('São Paulo - Sul')).toBeInTheDocument();
  });

  it('shows status chip and priority mode chip', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('shows inspector name, em-dash when null', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();

    const { container } = renderWithRouter(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ inspectorName: null })} />,
    );
    const emDashes = container.querySelectorAll('.text-text-muted');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('shows appointment rows with number and address', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('#1001')).toBeInTheDocument();
    expect(screen.getByText('#1002')).toBeInTheDocument();
    expect(screen.getByText('#1003')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Sydney')).toBeInTheDocument();
  });

  it('navigates to appointment detail on row click', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    fireEvent.click(screen.getByText('#1001'));
    expect(mockNavigate).toHaveBeenCalledWith('/appointments/apt-01');
  });

  it('shows empty state when no appointments', () => {
    renderWithRouter(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ appointments: [] })} />,
    );
    expect(screen.getByText('No appointments in this group.')).toBeInTheDocument();
    expect(screen.getByText('Appointments (0)')).toBeInTheDocument();
  });

  it('shows description section when present, hides when null', () => {
    const { unmount } = renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Operational group south region')).toBeInTheDocument();
    unmount();

    renderWithRouter(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ description: null })} />,
    );
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('renders createdAt and updatedAt', () => {
    renderWithRouter(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Updated At')).toBeInTheDocument();
  });
});
