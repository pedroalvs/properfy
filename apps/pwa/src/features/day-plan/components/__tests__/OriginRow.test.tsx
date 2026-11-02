import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { OriginRow } from '../OriginRow';
import { buildDayPlan } from '../../__fixtures__/day-plan';

const mockDelete = vi.fn();
vi.mock('@/services/api', () => ({ api: { DELETE: (...args: unknown[]) => mockDelete(...args) } }));

const onlineRef = { value: true };
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => onlineRef.value }));

const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSnackbar')>()),
  useSnackbar: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}));

function overridePlan() {
  return buildDayPlan({
    origin: { source: 'OVERRIDE', label: 'Sydney NSW 2000', lat: -33.87, lng: 151.2 },
    originOverride: {
      address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
      setAt: '2026-11-04T09:00:00.000Z',
    },
  });
}

beforeEach(() => {
  mockDelete.mockReset();
  showError.mockReset();
  onlineRef.value = true;
});

describe('OriginRow — Use my base address (clear override)', () => {
  it('DELETEs the origin on click', async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue({ data: { data: buildDayPlan() }, error: undefined, response: { status: 200 } });
    renderWithProviders(<OriginRow plan={overridePlan()} />);
    await user.click(screen.getByRole('button', { name: 'Use my base address' }));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/v1/inspector/day-plans/2026-11-05/origin', expect.anything()),
    );
  });

  it('surfaces the server error instead of swallowing it', async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'DAY_PLAN_ALREADY_STARTED', message: 'Your day has started; the route continues from your last stop.' } },
      response: { status: 422 },
    });
    renderWithProviders(<OriginRow plan={overridePlan()} />);
    await user.click(screen.getByRole('button', { name: 'Use my base address' }));
    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith('Your day has started; the route continues from your last stop.'),
    );
  });

  it('disables the clear button and explains when offline', () => {
    onlineRef.value = false;
    renderWithProviders(<OriginRow plan={overridePlan()} />);
    expect(screen.getByRole('button', { name: 'Use my base address' })).toBeDisabled();
    expect(screen.getByText("You're offline. Connect to change your starting point.")).toBeInTheDocument();
  });
});
