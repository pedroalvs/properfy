import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { OriginSheet } from '../OriginSheet';

const mockPut = vi.fn();
vi.mock('@/services/api', () => ({ api: { PUT: (...args: unknown[]) => mockPut(...args) } }));

const onlineRef = { value: true };
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => onlineRef.value }));

const DATE = '2026-11-05';

async function fillValidAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Street'), '1 George St');
  await user.type(screen.getByLabelText('Suburb'), 'Sydney');
  await user.selectOptions(screen.getByLabelText('State'), 'NSW');
  await user.type(screen.getByLabelText('Postcode'), '2000');
}

beforeEach(() => {
  mockPut.mockReset();
  onlineRef.value = true;
});

describe('OriginSheet', () => {
  it('shows the title and the per-day subtitle', () => {
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Start this day from')).toBeInTheDocument();
    expect(screen.getByText('Only for Thu 5 Nov. Your base address stays the same.')).toBeInTheDocument();
  });

  it('pre-fills from the current override address', () => {
    renderWithProviders(
      <OriginSheet
        open
        date={DATE}
        onOpenChange={vi.fn()}
        overrideAddress={{ street: '9 Cleveland St', suburb: 'Redfern', city: 'Redfern', state: 'NSW', postcode: '2016', country: 'AU' }}
      />,
    );
    expect(screen.getByLabelText('Street')).toHaveValue('9 Cleveland St');
    expect(screen.getByLabelText('Postcode')).toHaveValue('2016');
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use this address' }));
    expect(await screen.findByText('Street is required')).toBeInTheDocument();
    expect(screen.getByText('Suburb is required')).toBeInTheDocument();
    expect(screen.getByText('Select a state')).toBeInTheDocument();
    expect(screen.getByText('Postcode is required')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('PUTs the address and closes on success', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockPut.mockResolvedValue({ data: { data: { origin: { label: 'Sydney NSW 2000' } } }, error: undefined, response: { status: 200 } });
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={onOpenChange} />);
    await fillValidAddress(user);
    await user.click(screen.getByRole('button', { name: 'Use this address' }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        `/v1/inspector/day-plans/${DATE}/origin`,
        expect.objectContaining({ body: { address: expect.objectContaining({ suburb: 'Sydney', city: 'Sydney', country: 'AU' }) } }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the server error for a geocode failure and keeps the form open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockPut.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'DAY_PLAN_ORIGIN_NOT_FOUND', message: "We couldn't find this address. Check it and try again." } },
      response: { status: 422 },
    });
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={onOpenChange} />);
    await fillValidAddress(user);
    await user.click(screen.getByRole('button', { name: 'Use this address' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find this address. Check it and try again.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('DAY_PLAN_ALREADY_STARTED: shows the message, closes after 2s and invalidates (L-F04-07)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockPut.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'DAY_PLAN_ALREADY_STARTED', message: 'Your day has started; the route continues from your last stop.' } },
      response: { status: 422 },
    });
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={onOpenChange} />);
    await fillValidAddress(user);
    await user.click(screen.getByRole('button', { name: 'Use this address' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your day has started; the route continues from your last stop.');
    expect(onOpenChange).not.toHaveBeenCalled();
    // The sheet auto-closes after a 2s delay.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 3000 });
  });

  it('disables submit and explains when offline', () => {
    onlineRef.value = false;
    renderWithProviders(<OriginSheet open date={DATE} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use this address' })).toBeDisabled();
    expect(screen.getByText("You're offline. Connect to change your starting point.")).toBeInTheDocument();
  });
});
