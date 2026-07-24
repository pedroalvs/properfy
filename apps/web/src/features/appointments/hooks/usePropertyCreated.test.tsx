import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePropertyCreated } from './usePropertyCreated';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import { EMPTY_FORM_DATA } from '../types';

describe('usePropertyCreated', () => {
  it('invalidates property queries, selects the property and clears its error', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    let form: AppointmentFormData = { ...EMPTY_FORM_DATA };
    let errors: AppointmentFormErrors = { propertyId: 'Required field', branchId: 'Required field' };
    const setForm = vi.fn((updater: (prev: AppointmentFormData) => AppointmentFormData) => {
      form = updater(form);
    });
    const setErrors = vi.fn((updater: (prev: AppointmentFormErrors) => AppointmentFormErrors) => {
      errors = updater(errors);
    });

    const { result } = renderHook(
      () => usePropertyCreated(setForm as never, setErrors as never),
      { wrapper },
    );

    act(() => result.current('prop-new'));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['properties'] });
    expect(form.propertyId).toBe('prop-new');
    expect(errors.propertyId).toBeUndefined();
    expect(errors.branchId).toBe('Required field');
  });
});
