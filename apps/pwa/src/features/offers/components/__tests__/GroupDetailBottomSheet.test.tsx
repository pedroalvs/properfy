import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupDetailBottomSheet } from '../GroupDetailBottomSheet';
import type { MarketplaceOfferDetail } from '../../types';

vi.mock('../../hooks/useMarketplaceOfferDetail', () => ({
  useMarketplaceOfferDetail: vi.fn(),
}));

const mockUseIsOnline = vi.fn();
vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));

const mockShowError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showError: mockShowError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}));

import { useMarketplaceOfferDetail } from '../../hooks/useMarketplaceOfferDetail';

const mockUseDetail = vi.mocked(useMarketplaceOfferDetail);

const GROUP_ID = '00000000-0000-0000-0000-000000000002';

const mockDetail: MarketplaceOfferDetail = {
  groupId: GROUP_ID,
  groupNumber: 2042,
  code: '2042',
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
  properties: [
    { street: '123 Ocean St', suburb: 'Bondi NSW', propertyType: 'APARTMENT' },
    { street: '45 Beach Rd', suburb: 'Manly NSW', propertyType: 'HOUSE' },
  ],
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
      tenantName: 'Acme Realty',
      timeSlotStart: '08:00',
      timeSlotEnd: '09:00',
      street: '123 Ocean St',
      coordinates: null,
      propertyType: 'APARTMENT',
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      appointmentCode: 'APT-1002',
      appointmentNumber: 1002,
      suburb: 'Manly NSW',
      keyRequired: false,
      notes: null,
      payoutAmount: 150,
      tenantName: 'Globex Property',
      timeSlotStart: '11:30',
      timeSlotEnd: '12:30',
      street: '45 Beach Rd',
      coordinates: null,
      propertyType: 'HOUSE',
    },
  ],
};

describe('GroupDetailBottomSheet', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockShowError.mockClear();
    mockUseIsOnline.mockReset();
    mockUseIsOnline.mockReturnValue(true);
    mockUseDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof useMarketplaceOfferDetail>);
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
    // The suburb now travels with the street on one address line.
    expect(screen.getByText(/Bondi NSW/)).toBeInTheDocument();
    expect(screen.getByText(/Manly NSW/)).toBeInTheDocument();
  });

  it('does not render the group code badge in the header', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.queryByText(/Group #/)).toBeNull();
  });

  it('shows each appointment\'s agency (groups may span agencies)', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const agencies = screen.getAllByTestId('appointment-agency').map((el) => el.textContent);
    expect(agencies).toEqual(['Acme Realty', 'Globex Property']);
  });

  it('formats payout as A$ currency', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const payouts = screen.getAllByTestId('appointment-payout');
    expect(payouts).toHaveLength(2);
    payouts.forEach((el) => expect(el.textContent).toMatch(/\$150/));
  });

  /**
   * This assertion used to be its exact inverse: the sheet deliberately withheld
   * street-level text even though `street` was already in the payload. Client
   * scope doc §7.2 asks the offer detail for "Endereços e roteiro", so the
   * addresses are now shown. Inspectors see them before accepting, by design.
   */
  it('renders the full street address for each job', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const addresses = screen.getAllByTestId('appointment-address');
    expect(addresses).toHaveLength(2);
    expect(addresses[0]).toHaveTextContent('123 Ocean St, Bondi NSW');
    expect(addresses[1]).toHaveTextContent('45 Beach Rd, Manly NSW');
  });

  it('falls back to the suburb when a job has no street (soft-deleted property)', () => {
    const detail = {
      ...mockDetail,
      appointments: [{ ...mockDetail.appointments[0]!, street: '', propertyType: null }],
    };
    mockUseDetail.mockReturnValue({ data: detail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('appointment-address')).toHaveTextContent('Bondi NSW');
    expect(screen.queryByText(/Ocean St/)).toBeNull();
  });

  it('renders a property-type icon per job', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const icons = screen.getAllByTestId('appointment-property-type-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('aria-label', 'Apartment');
    expect(icons[1]).toHaveAttribute('aria-label', 'House');
  });

  // Doc §7.2: the offer detail shows the group's total value.
  it('shows the group total pinned above the accept action', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={vi.fn()} />);
    expect(screen.getByTestId('group-total-payout')).toHaveTextContent('$300');
  });

  it('shows the group total even when the sheet is read-only (no accept handler)', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('group-total-payout')).toHaveTextContent('$300');
    expect(screen.queryByTestId('accept-group-btn')).toBeNull();
  });

  it('renders a dash for the total when no payout is known', () => {
    mockUseDetail.mockReturnValue({ data: { ...mockDetail, payoutEstimate: null }, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('group-total-payout')).toHaveTextContent('\u2014');
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

  it("renders each appointment's own time slot", () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const times = screen.getAllByTestId('appointment-time').map((el) => el.textContent);
    expect(times).toEqual(['8:00 am – 9:00 am', '11:30 am – 12:30 pm']);
  });

  it('renders the group date formatted, not the raw ISO string', () => {
    mockUseDetail.mockReturnValue({ data: { ...mockDetail, scheduledDate: '2026-07-10T00:00:00.000Z' }, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByText('10/07/2026')).toBeInTheDocument();
    expect(screen.queryByText(/00:00:00/)).toBeNull();
  });

  it('renders group-level service type and time window', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getByText('8:00 am – 1:00 pm')).toBeInTheDocument();
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

  it('caps the sheet height and makes the body the scroll container', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('group-detail-sheet').className).toContain('max-h-[85dvh]');
    const body = screen.getByTestId('detail-body');
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('min-h-0');
    expect(body.className).toContain('overflow-y-auto');
  });

  it('renders a backdrop and closes when it is clicked', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    await user.click(screen.getByTestId('detail-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when the sheet itself is clicked', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    await user.click(screen.getByTestId('group-detail-sheet'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('exposes dialog semantics labelled by the heading', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Inspection details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape key', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll while open and restores it on unmount', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const { unmount } = render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('blocks accept with a snackbar error while offline', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    mockUseIsOnline.mockReturnValue(false);
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={onAccept} />);
    await user.click(screen.getByTestId('accept-group-btn'));
    expect(mockShowError).toHaveBeenCalledWith('You need to be connected to accept offers');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('disables the Accept button while accepting', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={vi.fn()} accepting />);
    const btn = screen.getByTestId('accept-group-btn');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Accepting…');
  });

  it('does not dismiss via backdrop, close button or Escape while accepting', async () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} onAccept={vi.fn()} accepting />);
    await user.click(screen.getByTestId('detail-backdrop'));
    await user.click(screen.getByTestId('detail-close'));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus into the sheet on open and restores it on unmount', () => {
    mockUseDetail.mockReturnValue({ data: mockDetail, isLoading: false, isError: false } as ReturnType<typeof useMarketplaceOfferDetail>);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('group-detail-sheet')).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('renders a retry button in the error state that refetches', async () => {
    const refetch = vi.fn();
    mockUseDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as unknown as ReturnType<typeof useMarketplaceOfferDetail>);
    const user = userEvent.setup();
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    await user.click(screen.getByTestId('detail-retry'));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('reserves the iOS home indicator on the sheet itself, not the accept footer', () => {
    // The footer only renders when an accept handler and data are present; when it is
    // absent the scrollable body is flush with the bottom edge. Padding the sheet
    // container covers both cases with one rule.
    render(<GroupDetailBottomSheet groupId={GROUP_ID} onClose={onClose} />);
    expect(screen.getByTestId('group-detail-sheet').classList.contains('pb-safe-b')).toBe(true);
  });
});
