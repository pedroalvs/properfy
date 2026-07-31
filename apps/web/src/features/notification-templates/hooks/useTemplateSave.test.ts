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

  it('sends notificationClass so the backend keeps the stored classification', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    await act(async () => {
      await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA, null, 'MARKETING');
    });

    const body = mockPut.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.notificationClass).toBe('MARKETING');
  });

  it('accepts a body with a handlebars else branch (the shipped appointment emails)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    // Verbatim shape of SERVICE_LABEL from the platform catalog — this is what
    // every appointment email carries, and what used to fail with
    // "Invalid variables: else" before the shared extractor landed.
    const data: TemplateFormData = {
      subject: '{{#if serviceTypeName}}{{serviceTypeName}}{{else}}Inspection{{/if}} at {{propertyAddress}}',
      body: 'Hello {{rentalTenantName}}, your {{#if serviceTypeName}}{{serviceTypeName}}{{else}}inspection{{/if}} '
        + 'at {{propertyAddress}} is on {{scheduledDate}}{{#if timeSlot}} at {{timeSlot}}{{/if}}.',
      active: true,
    };

    const errors = result.current.validate(
      data,
      ['rentalTenantName', 'propertyAddress', 'scheduledDate'],
      ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'serviceTypeName', 'timeSlot'],
    );
    expect(errors).toEqual({});
  });

  it('counts a variable referenced only as a block condition as used', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    const data: TemplateFormData = {
      subject: 'Inspection',
      body: '{{#if propertyAddress}}We will visit you{{/if}}',
      active: true,
    };

    const errors = result.current.validate(data, ['propertyAddress'], ['propertyAddress']);
    expect(errors).toEqual({});
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

  // Previously only BOTH fields being empty was an error, so a template could be
  // saved with no body at all — which then fails at send time (EMPTY_SMS_BODY)
  // long after the operator has left the screen.
  describe('empty content', () => {
    it('requires a body even when the subject is filled in', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate(
        { subject: 'Valid subject', body: '', active: true },
        [],
        undefined,
        'EMAIL',
      );

      expect(errors.body).toBe('Body is required');
    });

    it('treats a whitespace-only body as empty', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate(
        { subject: 'Valid subject', body: '   \n  ', active: true },
        [],
        undefined,
        'EMAIL',
      );

      expect(errors.body).toBe('Body is required');
    });

    it('requires a subject on EMAIL templates', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate(
        { subject: '', body: 'Some body', active: true },
        [],
        undefined,
        'EMAIL',
      );

      expect(errors.subject).toBe('Subject is required');
    });

    it('does not require a subject on SMS templates — SMS has no subject line', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate(
        { subject: '', body: 'Properfy: your inspection is scheduled.', active: true },
        [],
        undefined,
        'SMS',
      );

      expect(errors.subject).toBeUndefined();
      expect(errors.body).toBeUndefined();
    });

    it('still requires a body on SMS templates', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate(
        { subject: '', body: '', active: true },
        [],
        undefined,
        'SMS',
      );

      expect(errors.body).toBe('Body is required');
    });

    it('defaults to the stricter EMAIL rules when no channel is passed', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateSave(), { wrapper });

      const errors = result.current.validate({ subject: '', body: '', active: true }, []);

      expect(errors.subject).toBe('Subject is required');
      expect(errors.body).toBe('Body is required');
    });
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

  it('save maps VALIDATION_ERROR details to form field errors (bodyHtml → body)', async () => {
    mockPut.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'bodyHtml', message: 'Missing required variable: scheduledDate' },
            { field: 'subject', message: 'Subject is too long' },
          ],
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.fieldErrors?.body).toBe('Missing required variable: scheduledDate');
    expect(saveResult?.fieldErrors?.subject).toBe('Subject is too long');
    expect(saveResult?.error).toBeUndefined();
  });

  it('save keeps the summary error for details that do not match form fields', async () => {
    mockPut.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'tenantId', message: 'Unknown agency' }],
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateSave(), { wrapper });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save('INSPECTION_NOTICE', 'EMAIL', VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.fieldErrors).toBeUndefined();
    expect(saveResult?.error).toBe('Validation failed');
  });
});
