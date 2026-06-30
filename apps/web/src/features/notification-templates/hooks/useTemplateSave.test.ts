import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useTemplateSave } from './useTemplateSave';
import type { TemplateFormData } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;

const VALID_DATA: TemplateFormData = {
  subject: 'Inspection at {{propertyAddress}}',
  body: 'Hello {{rentalTenantName}}, your inspection is on {{scheduledDate}}.',
  active: true,
};

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({ data: { data: { id: 'tpl-01' } } });
});

describe('useTemplateSave', () => {
  it('calls PUT with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(
      '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
      { body: { subject: VALID_DATA.subject, bodyHtml: VALID_DATA.body, isActive: VALID_DATA.active } },
    );
  });

  it('sends tenantId in the body when provided (override edit)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    await act(async () => {
      await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA, 'tenant-1');
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
      { body: { subject: VALID_DATA.subject, bodyHtml: VALID_DATA.body, isActive: VALID_DATA.active, tenantId: 'tenant-1' } },
    );
  });

  it('omits tenantId from the body when null (platform default edit)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    await act(async () => {
      await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA, null);
    });

    const body = mockPut.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.tenantId).toBeUndefined();
  });

  it('validates against disallowed variables', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const data: TemplateFormData = {
      subject: 'Hello',
      body: 'Test {{unknown_var}} here',
      active: true,
    };

    const errors = result.current.validate(data, []);
    expect(errors.body).toContain('Invalid variables');
    expect(errors.body).toContain('unknown_var');
  });

  it('rejects HTML in subject line', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const data: TemplateFormData = {
      subject: 'Hello <b>World</b>',
      body: 'Some body text',
      active: true,
    };

    const errors = result.current.validate(data, []);
    expect(errors.subject).toContain('HTML is not allowed in the subject line');
  });

  it('allows HTML in body', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const data: TemplateFormData = {
      subject: 'Valid subject',
      body: '<p>Hello <strong>{{rentalTenantName}}</strong></p>',
      active: true,
    };

    const errors = result.current.validate(data, ['rentalTenantName']);
    expect(errors.body).toBeUndefined();
  });

  it('sends bodyHtml verbatim (no auto-detection or bifurcation)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const htmlData: TemplateFormData = {
      subject: 'Test',
      body: '<p>Hello {{rentalTenantName}}</p>',
      active: true,
    };

    await act(async () => {
      await result.current.save('INSPECTION_NOTICE', 'EMAIL', htmlData);
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
      { body: { subject: 'Test', bodyHtml: '<p>Hello {{rentalTenantName}}</p>', isActive: true } },
    );
  });

  it('reports missing required variables', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const data: TemplateFormData = {
      subject: 'Hello',
      body: 'Some body without variables',
      active: true,
    };

    const errors = result.current.validate(data, ['tenant_name', 'scheduled_date']);
    expect(errors.body).toContain('Missing required variables');
    expect(errors.body).toContain('tenant_name');
    expect(errors.body).toContain('scheduled_date');
  });

  it('returns no errors for valid data with required variables', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const errors = result.current.validate(VALID_DATA, ['rentalTenantName', 'scheduledDate']);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns failure on API error', async () => {
    mockPut.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });

  it('isSaving is true during save operation', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockPut.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolveRequest({ data: { data: { id: 'tpl-01' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
