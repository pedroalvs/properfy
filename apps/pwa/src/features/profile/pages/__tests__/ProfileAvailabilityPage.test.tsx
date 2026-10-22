import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfileAvailabilityPage } from '../ProfileAvailabilityPage';

const mockUseAvailability = vi.fn();
const mockMutateAvailability = vi.fn();
const mockUsePrompt = vi.fn();

vi.mock('../../hooks/useInspectorAvailabilityTemplate', () => ({
  useInspectorAvailabilityTemplate: () => mockUseAvailability(),
}));

vi.mock('../../hooks/useUpdateInspectorAvailabilityTemplate', () => ({
  useUpdateInspectorAvailabilityTemplate: () => ({
    mutateAsync: mockMutateAvailability,
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/lib/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUsePrompt(isDirty),
}));

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };
const AVAILABILITY = {
  template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
  overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
};

describe('ProfileAvailabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePrompt.mockImplementation(() => {});
  });

  it('shows the loading hint while availability is undefined', () => {
    mockUseAvailability.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ProfileAvailabilityPage />);
    expect(screen.getByTestId('availability-section')).toBeInTheDocument();
    expect(screen.getByText(/loading availability/i)).toBeInTheDocument();
  });

  it('renders the editable grid and tracks dirty state for the unsaved-changes prompt', async () => {
    mockUseAvailability.mockReturnValue({ data: AVAILABILITY, isLoading: false });
    const user = userEvent.setup();
    renderWithProviders(<ProfileAvailabilityPage />);

    expect(mockUsePrompt).toHaveBeenLastCalledWith(false);

    // Tuesday AM is OFF initially.
    const tuesdayAm = screen.getAllByRole('button', { name: /AM/i })[1]!;
    await user.click(tuesdayAm);

    expect(mockUsePrompt).toHaveBeenLastCalledWith(true);
  });
});
