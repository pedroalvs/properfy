import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceGroupStatus, PriorityMode } from '@properfy/shared';
import { ServiceGroupDetailSections } from './ServiceGroupDetailSections';
import type { ServiceGroupDetail } from '../types';

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
    appointmentsCount: 8,
    appointmentCodes: ['VST-001', 'VST-002', 'VST-003'],
    description: 'Operational group south region',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('ServiceGroupDetailSections', () => {
  it('renders section titles', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders name and region', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Zona Sul SP')).toBeInTheDocument();
    expect(screen.getByText('São Paulo - Sul')).toBeInTheDocument();
  });

  it('shows status chip and priority mode chip', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('shows inspector name, em-dash when null', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();

    const { container } = render(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ inspectorName: null })} />,
    );
    const emDashes = container.querySelectorAll('.text-text-muted');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('shows appointments count', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows appointment codes list, em-dash when empty', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('VST-001, VST-002, VST-003')).toBeInTheDocument();

    const { container } = render(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ appointmentCodes: [] })} />,
    );
    const emDashes = container.querySelectorAll('.text-text-muted');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('shows description section when present, hides when null', () => {
    const { unmount } = render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Operational group south region')).toBeInTheDocument();
    unmount();

    render(
      <ServiceGroupDetailSections serviceGroup={makeServiceGroup({ description: null })} />,
    );
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('renders createdAt and updatedAt', () => {
    render(<ServiceGroupDetailSections serviceGroup={makeServiceGroup()} />);
    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Updated At')).toBeInTheDocument();
  });
});
