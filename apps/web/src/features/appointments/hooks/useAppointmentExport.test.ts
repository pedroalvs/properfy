import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn() },
}));

import { api } from '@/services/api';
import { useAppointmentExport } from './useAppointmentExport';
import { DEFAULT_FILTERS } from '../types';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function okResponse(filename = 'appointments-2026-08-03.xlsx') {
  return {
    data: {
      data: {
        filename,
        contentType: XLSX_MIME,
        // "fake-xlsx" in base64.
        contentBase64: 'ZmFrZS14bHN4',
      },
    },
    error: undefined,
    response: { status: 200 },
  };
}

let clickSpy: ReturnType<typeof vi.fn>;
let createdUrls: string[];
let revokedUrls: string[];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue(okResponse());

  createdUrls = [];
  revokedUrls = [];
  clickSpy = vi.fn();

  // jsdom implements neither of these.
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock-${createdUrls.length}`;
    createdUrls.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => { revokedUrls.push(url); });

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAppointmentExport', () => {
  it('requests the export endpoint and triggers a download', async () => {
    const { result } = renderHook(() => useAppointmentExport());

    await act(async () => {
      await result.current.exportAppointments(DEFAULT_FILTERS);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/appointments/export', expect.anything());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The object URL must be released, or every export leaks a blob.
    expect(revokedUrls).toEqual(createdUrls);
  });

  // The whole point of the feature: the file is the on-screen selection.
  it('sends exactly the filters the list query would send', async () => {
    const { result } = renderHook(() => useAppointmentExport());

    await act(async () => {
      await result.current.exportAppointments({
        ...DEFAULT_FILTERS,
        suburb: 'Bondi',
        status: 'DONE',
        confirmationStatus: 'sent',
        search: 'INS-0042',
        showCancelled: true,
      });
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query).toMatchObject({
      suburb: 'Bondi',
      status: 'DONE',
      confirmationStatus: 'sent',
      search: 'INS-0042',
      showCancelled: 'true',
    });
  });

  it('does not paginate — the export is the whole filtered set', async () => {
    const { result } = renderHook(() => useAppointmentExport());

    await act(async () => {
      await result.current.exportAppointments(DEFAULT_FILTERS);
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query.page).toBeUndefined();
    expect(query.pageSize).toBeUndefined();
    expect(query.sortBy).toBeUndefined();
  });

  it('omits filters left at their defaults', async () => {
    const { result } = renderHook(() => useAppointmentExport());

    await act(async () => {
      await result.current.exportAppointments(DEFAULT_FILTERS);
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query.suburb).toBeUndefined();
    expect(query.confirmationStatus).toBeUndefined();
    expect(query.showCancelled).toBeUndefined();
  });

  it('throws the server message so the caller can surface the row cap', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { message: 'This selection has 9000 appointments', code: 'VALIDATION_ERROR' } },
      response: { status: 400 },
    });
    const { result } = renderHook(() => useAppointmentExport());

    await expect(
      act(async () => {
        await result.current.exportAppointments(DEFAULT_FILTERS);
      }),
    ).rejects.toThrow('This selection has 9000 appointments');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('clears the exporting flag even when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAppointmentExport());

    await expect(
      act(async () => {
        await result.current.exportAppointments(DEFAULT_FILTERS);
      }),
    ).rejects.toThrow('network down');

    expect(result.current.isExporting).toBe(false);
  });
});
