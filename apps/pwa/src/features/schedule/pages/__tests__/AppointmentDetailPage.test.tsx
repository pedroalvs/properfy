import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import { render } from '@testing-library/react';
import { AppointmentDetailPage } from '../AppointmentDetailPage';

const mockUseInspectorAppointment = vi.fn();
const mockUseLocalExecutionState = vi.fn();

vi.mock('@/features/schedule/hooks/useInspectorAppointment', () => ({
  useInspectorAppointment: (...args: unknown[]) => mockUseInspectorAppointment(...args),
}));

vi.mock('@/features/execution/hooks/useLocalExecutionState', () => ({
  useLocalExecutionState: (...args: unknown[]) => mockUseLocalExecutionState(...args),
}));

vi.mock('@/components/shell/TopBar', () => ({
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/feedback/LoadingState', () => ({
  LoadingState: () => <div>Loading</div>,
}));

vi.mock('@/components/feedback/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@/components/ui/StatusChip', () => ({
  StatusChip: ({ status }: { status?: string }) => <div>{status ?? 'chip'}</div>,
}));

vi.mock('../../components/TenantConfirmationBanner', () => ({
  TenantConfirmationBanner: () => <div>Tenant confirmation</div>,
}));

vi.mock('../../components/PropertyAddressSection', () => ({
  PropertyAddressSection: ({ address }: { address: string }) => <div>{address}</div>,
}));

vi.mock('../../components/TenantContactSection', () => ({
  TenantContactSection: () => <div>Tenant contact</div>,
}));

vi.mock('../../components/KeyDetailsSection', () => ({
  KeyDetailsSection: () => <div>Key details</div>,
}));

vi.mock('../../components/StartInspectionButton', () => ({
  StartInspectionButton: ({ resume }: { resume?: boolean }) => (
    <div data-testid="start-inspection-cta">{resume ? 'Resume Inspection' : 'Start Inspection'}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/schedule/apt-1']}>
      <Routes>
        <Route path="/schedule/:appointmentId" element={<AppointmentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const appointmentData = {
  data: {
    id: 'apt-1',
    propertyAddress: '123 Main St',
    suburb: 'Brunswick',
    scheduledDate: '2026-03-25',
    timeSlot: '09:00-11:00',
    timeSlotStart: '2026-03-25T09:00:00',
    timeSlotEnd: '2026-03-25T11:00:00',
    status: AppointmentStatus.SCHEDULED,
    tenantConfirmation: TenantConfirmationStatus.CONFIRMED,
    serviceTypeName: 'Routine Inspection',
    flowType: ServiceTypeFlowType.ROUTINE,
    tenantName: 'John Tenant',
    tenantPhone: null,
    tenantEmail: null,
    keyRequired: false,
    meetingLocation: null,
    restrictions: null,
    propertyLatitude: null,
    propertyLongitude: null,
    notes: null,
  },
};

describe('AppointmentDetailPage', () => {
  beforeEach(() => {
    mockUseInspectorAppointment.mockReset();
    mockUseLocalExecutionState.mockReset();

    mockUseInspectorAppointment.mockReturnValue({
      data: appointmentData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockUseLocalExecutionState.mockReturnValue({
      state: { phase: 'PRE_START' },
      isRestored: true,
    });
  });

  it('shows start CTA for scheduled appointments with no local progress', () => {
    renderPage();
    expect(screen.getByTestId('start-inspection-cta')).toHaveTextContent('Start Inspection');
  });

  it('shows resume CTA when there is local execution in progress', () => {
    mockUseLocalExecutionState.mockReturnValue({
      state: { phase: 'IN_PROGRESS' },
      isRestored: true,
    });

    renderPage();

    expect(screen.getByTestId('start-inspection-cta')).toHaveTextContent('Resume Inspection');
  });
});
