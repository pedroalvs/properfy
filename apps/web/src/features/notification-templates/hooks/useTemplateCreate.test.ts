import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
import { api } from '@/services/api';
import { useTemplateCreate, prefillFromDefault } from './useTemplateCreate';
import { inferChannelFromCode, type NotificationTemplate, type TemplateFormData } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    id: 'tpl-1',
    tenantId: null,
    rentalTenantName: null,
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Default subject',
    body: '<p>Default body {{rentalTenantName}}</p>',
    active: true,
    notificationClass: 'OPERATIONAL',
    requiredVariables: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

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

describe('prefillFromDefault', () => {
  it('seeds the form from the matching platform default', () => {
    const list = [
      makeTemplate({ id: 'd1', tenantId: null, code: 'INSPECTION_NOTICE', subject: 'S', body: 'B' }),
      makeTemplate({ id: 'o1', tenantId: 'agency-1', code: 'INSPECTION_NOTICE', subject: 'X', body: 'Y' }),
    ];
    expect(prefillFromDefault('INSPECTION_NOTICE', list)).toEqual({ subject: 'S', body: 'B', active: true });
  });

  it('ignores agency overrides and only reads the platform default', () => {
    const list = [makeTemplate({ tenantId: 'agency-1', code: 'INSPECTION_NOTICE', subject: 'X', body: 'Y' })];
    expect(prefillFromDefault('INSPECTION_NOTICE', list)).toEqual({ subject: '', body: '', active: true });
  });

  it('returns an empty form when no default exists for the code', () => {
    expect(prefillFromDefault('REPORT_READY', [])).toEqual({ subject: '', body: '', active: true });
  });
});

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
