import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useContactRelations } from './useContactRelations';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function prop(id: string) {
  return {
    propertyId: id,
    propertyCode: `AG-PROP-${id}`,
    street: '1 Test St',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    appointmentCount: 0,
    isPrimaryInActiveAppointment: false,
  };
}

function getPathArg(callIndex: number): string {
  return String(mockGet.mock.calls[callIndex]?.[0] ?? '');
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('useContactRelations', () => {
  it('does NOT fetch when `enabled` is omitted (lazy by default, #549)', async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    const wrapper = createQueryWrapper();
    renderHook(() => useContactRelations('c-1'), { wrapper });

    // Give react-query a tick; nothing should fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches when enabled is explicitly true', async () => {
    mockGet.mockResolvedValue({
      data: { data: { properties: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactRelations('c-1', { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalled();
  });

  it('paginates properties with load-more and accumulates pages in order (#220)', async () => {
    mockGet.mockImplementation(async (path: string) => {
      const isPage2 = String(path).includes('propertiesPage=2');
      return {
        data: {
          data: {
            properties: {
              data: isPage2 ? [prop('3'), prop('4')] : [prop('1'), prop('2')],
              pagination: { page: isPage2 ? 2 : 1, pageSize: 2, total: 4, totalPages: 2 },
            },
            appointments: {
              data: [],
              pagination: { page: 1, pageSize: 2, total: 0, totalPages: 0 },
            },
          },
        },
      };
    });

    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useContactRelations('c-1', { enabled: true, propertiesPageSize: 2, appointmentsPageSize: 2 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.properties.length).toBe(2));
    expect(result.current.hasMoreProperties).toBe(true);

    act(() => result.current.loadMoreProperties());

    await waitFor(() => expect(result.current.properties.length).toBe(4));
    // Accumulated in order: page 1 then page 2.
    expect(result.current.properties.map((p) => p.propertyId)).toEqual(['1', '2', '3', '4']);
    expect(result.current.hasMoreProperties).toBe(false);
    // The second request carried propertiesPage=2.
    expect(mockGet.mock.calls.some((_, i) => getPathArg(i).includes('propertiesPage=2'))).toBe(true);
  });

  it('paginates appointments with load-more independently of properties', async () => {
    mockGet.mockImplementation(async (path: string) => {
      const isApptPage2 = String(path).includes('appointmentsPage=2');
      return {
        data: {
          data: {
            properties: {
              data: [prop('1')],
              pagination: { page: 1, pageSize: 2, total: 1, totalPages: 1 },
            },
            appointments: {
              data: isApptPage2
                ? [{ appointmentId: 'a3', appointmentNumber: 3, status: 'DONE', scheduledDate: '2026-01-01', role: 'TENANT', isPrimary: false, propertyId: '1', propertyCode: 'AG-PROP-1' }]
                : [{ appointmentId: 'a1', appointmentNumber: 1, status: 'SCHEDULED', scheduledDate: '2026-01-01', role: 'TENANT', isPrimary: false, propertyId: '1', propertyCode: 'AG-PROP-1' }],
              pagination: { page: isApptPage2 ? 2 : 1, pageSize: 1, total: 2, totalPages: 2 },
            },
          },
        },
      };
    });

    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useContactRelations('c-1', { enabled: true, appointmentsPageSize: 1 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.appointments.length).toBe(1));
    expect(result.current.hasMoreAppointments).toBe(true);

    act(() => result.current.loadMoreAppointments());

    await waitFor(() => expect(result.current.appointments.length).toBe(2));
    expect(result.current.appointments.map((a) => a.appointmentId)).toEqual(['a1', 'a3']);
    expect(result.current.hasMoreAppointments).toBe(false);
    expect(mockGet.mock.calls.some((_, i) => getPathArg(i).includes('appointmentsPage=2'))).toBe(true);
  });

  it('resets accumulated pagination when the contactId changes', async () => {
    mockGet.mockImplementation(async (path: string) => {
      const id = /\/v1\/contacts\/([^?]+)/.exec(String(path))?.[1];
      const isPage2 = String(path).includes('propertiesPage=2');
      return {
        data: {
          data: {
            properties: {
              data: isPage2 ? [prop(`${id}-p2`)] : [prop(`${id}-p1`)],
              pagination: { page: isPage2 ? 2 : 1, pageSize: 1, total: 2, totalPages: 2 },
            },
            appointments: { data: [], pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0 } },
          },
        },
      };
    });

    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ id }) => useContactRelations(id, { enabled: true, propertiesPageSize: 1 }),
      { wrapper, initialProps: { id: 'contact-a' } },
    );

    await waitFor(() => expect(result.current.properties.length).toBe(1));
    act(() => result.current.loadMoreProperties());
    await waitFor(() => expect(result.current.properties.length).toBe(2));

    // Switch contact — accumulated pages and pagination must reset to page 1.
    rerender({ id: 'contact-b' });
    await waitFor(() =>
      expect(result.current.properties.some((p) => p.propertyId === 'contact-b-p1')).toBe(true),
    );
    expect(result.current.properties.every((p) => p.propertyId.startsWith('contact-b'))).toBe(true);
    expect(result.current.properties.length).toBe(1);
    expect(result.current.hasMoreProperties).toBe(true);
  });

  it('exposes pagination meta and hasMore flags', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          properties: { data: [prop('1')], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
          appointments: { data: [], pagination: { page: 1, pageSize: 20, total: 5, totalPages: 3 } },
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactRelations('c-1', { enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.properties.length).toBe(1));
    expect(result.current.hasMoreProperties).toBe(false);
    expect(result.current.hasMoreAppointments).toBe(true);
    expect(result.current.appointmentsPagination?.totalPages).toBe(3);
  });
});
