import { renderHook } from '@testing-library/react';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { useEffectiveTimezone } from '../useEffectiveTimezone';

const mockUseAuth = vi.fn();

vi.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useEffectiveTimezone', () => {
  it('returns the user effective timezone from /v1/me', () => {
    mockUseAuth.mockReturnValue({ user: { timezone: 'Australia/Perth' } });
    const { result } = renderHook(() => useEffectiveTimezone());
    expect(result.current).toBe('Australia/Perth');
  });

  it('falls back to the platform timezone when unset', () => {
    mockUseAuth.mockReturnValue({ user: { timezone: null } });
    const { result } = renderHook(() => useEffectiveTimezone());
    expect(result.current).toBe(PLATFORM_TIMEZONE);
  });

  it('falls back to the platform timezone while the user is hydrating', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useEffectiveTimezone());
    expect(result.current).toBe(PLATFORM_TIMEZONE);
  });
});
