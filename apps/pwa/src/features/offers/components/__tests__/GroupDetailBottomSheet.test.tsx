import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupDetailBottomSheet } from '../GroupDetailBottomSheet';
import type { MarketplaceOfferDetail } from '../../types';

vi.mock('../../hooks/useMarketplaceOfferDetail', () => ({
  useMarketplaceOfferDetail: vi.fn(),
}));

import { useMarketplaceOfferDetail } from '../../hooks/useMarketplaceOfferDetail';

const mockUseDetail = vi.mocked(useMarketplaceOfferDetail);

const GROUP_ID = '00000000-0000-0000-0000-000000000002';

const mockDetail: MarketplaceOfferDetail = {
  groupId: GROUP_ID,
  tenantName: 'Properfy Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 2,
  scheduledDate: '2026-06-01',
  timeWindow: '08:00-13:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Bondi', 'Manly'],
  payoutEstimate: 300,
  appointmentCount: 2,
  centroid: null,
  addresses: ['123 Ocean St, Bondi NSW', '45 Beach Rd, Manly NSW'],
  keyRequired: false,
  notes: null,
  appointments: [
    {
      id: '00000000-0000-0000-0000-000000000011',
      appointmentCode: 'APT-1001',
      appointmentNumber: 1001,
      suburb: 'Bondi NSW',
      keyRequired: false,
      notes: null,
      payoutAmount: 150,
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      appointmentCode: 'APT-1002',
      appointmentNumber: 1002,
      suburb: 'Manly NSW',
      keyRequired: false,
      notes: null,
      payoutAmount: 150,
    },
  ],
};

describe('GroupDetailBottomSheet', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockUseDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
  });

  it('renders nothing when groupId is null', () => {
    const { container } = render(
      <GroupDetailBottomSheet groupId={null} onClose={onClose} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state while fetching', () => {
    mockUseDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('detail-loading')).toBeInTheDocument();
  });

  it('renders appointment rows from detail data', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByText('Bondi NSW')).toBeInTheDocument();
    expect(screen.getByText('Manly NSW')).toBeInTheDocument();
  });

  it('formats payout as A$ currency', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const payouts = screen.getAllByTestId('appointment-payout');
    expect(payouts).toHaveLength(2);
    payouts.forEach((el) => expect(el.textContent).toMatch(/\$150/));
  });

  it('does not render raw street-level address text', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.queryByText(/Ocean St/)).toBeNull();
    expect(screen.queryByText(/Beach Rd/)).toBeNull();
  });

  it('calls onClose when close button is pressed', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    await user.click(screen.getByTestId('detail-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows error state when fetch fails', () => {
    mockUseDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('detail-error')).toBeInTheDocument();
  });

  it('renders appointmentCode badge for each appointment', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByText('APT-1001')).toBeInTheDocument();
    expect(screen.getByText('APT-1002')).toBeInTheDocument();
  });

  it('renders group-level service type and time window', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getByText('08:00-13:00')).toBeInTheDocument();
  });

  it('does not render Accept button when onAccept is not provided', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.queryByTestId('accept-group-btn')).not.toBeInTheDocument();
  });

  it('renders Accept group button when onAccept prop is provided', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const onAccept = vi.fn();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={onAccept} />);
    expect(screen.getByTestId('accept-group-btn')).toBeInTheDocument();
  });

  it('calls onAccept when Accept group button is clicked', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={onAccept} />);
    await user.click(screen.getByTestId('accept-group-btn'));
    expect(onAccept).toHaveBeenCalledOnce();
  });
});
