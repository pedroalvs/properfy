import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
import { api } from '@/services/api';
import { useTemplateCreate } from './useTemplateCreate';
import { inferChannelFromCode, type TemplateFormData } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({ data: { data: { id: 'tpl-new' } } });
});

describe('inferChannelFromCode', () => {
  it('returns SMS for _SMS codes', () => {
    expect(inferChannelFromCode('INSPECTION_NOTICE_SMS')).toBe('SMS');
    expect(inferChannelFromCode('REMINDER_3_DAYS_SMS')).toBe('SMS');
  });
  it('returns EMAIL for non-SMS codes', () => {
    expect(inferChannelFromCode('INSPECTION_NOTICE')).toBe('EMAIL');
    expect(inferChannelFromCode('REPORT_READY')).toBe('EMAIL');
  });
});

// Prefill now goes through GET .../default — covered in TemplateCreateDrawer.test.tsx.

describe('useTemplateCreate', () => {
  const data: TemplateFormData = { subject: 'Hi', body: '<p>Hello {{rentalTenantName}}</p>', active: true };

  it('PUTs to the derived channel with tenantId and isActive', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateCreate(), { wrapper });

    await act(async () => {
      await result.current.save('INSPECTION_NOTICE_SMS', 'agency-1', data);
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/v1/notification-templates/INSPECTION_NOTICE_SMS/SMS',
      { body: { subject: 'Hi', bodyHtml: data.body, isActive: true, tenantId: 'agency-1' } },
    );
  });
});
