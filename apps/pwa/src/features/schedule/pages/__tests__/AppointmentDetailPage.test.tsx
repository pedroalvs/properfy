import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppointmentStatus, RentalTenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
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

vi.mock('../../components/RentalTenantConfirmationBanner', () => ({
  RentalTenantConfirmationBanner: () => <div>Tenant confirmation</div>,
}));

vi.mock('../../components/PropertyAddressSection', () => ({
  PropertyAddressSection: ({ address }: { address: string }) => <div>{address}</div>,
}));

// ContactsSection and RestrictionsSection are rendered for real (covered here
// via role labels/badges assertions and by their own component tests).

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
    appointmentCode: 'INS-0099',
    propertyAddress: '123 Main St',
    suburb: 'Brunswick',
    scheduledDate: '2026-03-25',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    status: AppointmentStatus.SCHEDULED,
    rentalTenantConfirmation: RentalTenantConfirmationStatus.CONFIRMED,
    serviceTypeName: 'Routine Inspection',
    flowType: ServiceTypeFlowType.ROUTINE,
    rentalTenantName: 'John Tenant',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    keyRequired: false,
    meetingLocation: null,
    restrictions: null,
    propertyLatitude: null,
    propertyLongitude: null,
    notes: null,
    observation: null,
    customFields: [],
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

  it('displays the appointment code in the header', () => {
    renderPage();
    expect(screen.getByTestId('appointment-code')).toHaveTextContent('INS-0099');
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

  it('shows overdue banner when appointment is overdue', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: { ...appointmentData.data, isOverdue: true },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('overdue-banner')).toBeInTheDocument();
    expect(screen.getByText(/Overdue.*scheduled date has passed/)).toBeInTheDocument();
  });

  it('does not show overdue banner when appointment is not overdue', () => {
    renderPage();

    expect(screen.queryByTestId('overdue-banner')).not.toBeInTheDocument();
  });

  it('renders the Observation section when an observation is present', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: { ...appointmentData.data, observation: 'Gate code is 4321' },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText('Gate code is 4321')).toBeInTheDocument();
  });

  it('hides the Observation section when observation is empty', () => {
    renderPage();

    expect(screen.queryByText('Observation')).not.toBeInTheDocument();
  });

  it('renders the Custom Fields section read-only when present', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: {
          ...appointmentData.data,
          customFields: [
            { label: 'Gate code', value: '1234' },
            { label: 'Parking', value: 'Level 2' },
          ],
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Custom Fields')).toBeInTheDocument();
    expect(screen.getByText('Gate code')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
  });

  it('hides the Custom Fields section when there are none', () => {
    renderPage();

    expect(screen.queryByText('Custom Fields')).not.toBeInTheDocument();
  });

  it('renders all jobDetails tenant contacts with roles in the Contacts section', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: appointmentData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      jobDetails: {
        agency: { id: 't1', name: 'Alpha Realty' },
        tenantContacts: [
          {
            name: 'John Tenant', email: 'john@x.com', phone: '+61400000000',
            role: 'RENTAL_TENANT', isPrimary: true,
            additionalChannels: [{ channel: 'PHONE', value: '+61411111111', label: 'Work' }],
          },
          { name: 'Helen Keeper', email: null, phone: '+61422222222', role: 'HOUSEKEEPER', isPrimary: false, company: 'CleanCo' },
        ],
        keys: { keyRequired: false, keyLocation: null },
        propertyManager: null,
        payment: { payoutAmount: 80, currency: 'AUD' },
      },
    });

    renderPage();

    expect(screen.getAllByTestId('contact-item')).toHaveLength(2);
    expect(screen.getByText('Helen Keeper')).toBeInTheDocument();
    expect(screen.getByText('Housekeeper')).toBeInTheDocument();
    expect(screen.getByText('CleanCo')).toBeInTheDocument();
    expect(screen.getByTestId('contact-primary-badge')).toBeInTheDocument();
    expect(screen.getByTestId('contact-extra-channel-0-0')).toHaveAttribute('href', 'tel:+61411111111');
  });

  it('falls back to the single flat tenant contact when jobDetails is absent', () => {
    renderPage();

    expect(screen.getAllByTestId('contact-item')).toHaveLength(1);
    expect(screen.getByText('John Tenant')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
  });

  it('renders structured restrictions in their own section', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: {
          ...appointmentData.data,
          restrictions: 'Dog in backyard',
          restrictionDetails: [
            { isHome: true, unavailableDays: ['Monday'], unavailableHours: [], notes: 'Dog in backyard' },
          ],
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('restrictions-section')).toBeInTheDocument();
    expect(screen.getByText('Tenant will be home')).toBeInTheDocument();
    expect(screen.getByText(/Monday/)).toBeInTheDocument();
  });
});
