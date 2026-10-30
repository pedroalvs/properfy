import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { BaseAddressBanner } from '../BaseAddressBanner';

const mockUseInspectorMe = vi.fn();
vi.mock('@/features/profile/hooks/useInspectorMe', () => ({
  useInspectorMe: () => mockUseInspectorMe(),
}));

const meWith = (data: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) => ({
  data: data === undefined ? undefined : { data: { id: 'insp-1', ...data } },
  isLoading: false,
  isError: false,
  ...extra,
});

describe('BaseAddressBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows variant 1 when there is no saved address', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: null, baseLat: null }));
    renderWithProviders(<BaseAddressBanner />);
    expect(screen.getByText('Add your base address')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add address/i })).toHaveAttribute(
      'href',
      '/profile/account#base-address',
    );
  });

  it('shows variant 2 when the saved address could not be located', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: { street: 'x' }, baseLat: null }));
    renderWithProviders(<BaseAddressBanner />);
    expect(
      screen.getByText('We couldn’t locate your base address — please check it'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /check address/i })).toHaveAttribute(
      'href',
      '/profile/account#base-address',
    );
  });

  it('renders nothing when the base has coordinates', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: { street: 'x' }, baseLat: -33.8 }));
    const { container } = renderWithProviders(<BaseAddressBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while loading', () => {
    mockUseInspectorMe.mockReturnValue(meWith(undefined, { isLoading: true }));
    const { container } = renderWithProviders(<BaseAddressBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    mockUseInspectorMe.mockReturnValue(meWith(undefined, { isError: true }));
    const { container } = renderWithProviders(<BaseAddressBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is non-dismissable and exposed as a status region', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: null, baseLat: null }));
    renderWithProviders(<BaseAddressBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
