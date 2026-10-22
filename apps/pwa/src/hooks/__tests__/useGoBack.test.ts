import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockNavigate = vi.fn();
let mockLocationKey = 'abc123';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ key: mockLocationKey, pathname: '/', search: '', hash: '', state: null }),
  };
});

import { useGoBack } from '../useGoBack';

beforeEach(() => {
  mockNavigate.mockClear();
  mockLocationKey = 'abc123';
});

describe('useGoBack', () => {
  it('pops in-app history when a real router entry exists', () => {
    const { result } = renderHook(() => useGoBack('/earnings'));
    result.current();
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('navigates to the fallback (replace) on a cold/direct load', () => {
    mockLocationKey = 'default';
    const { result } = renderHook(() => useGoBack('/earnings'));
    result.current();
    expect(mockNavigate).toHaveBeenCalledWith('/earnings', { replace: true });
  });
});
