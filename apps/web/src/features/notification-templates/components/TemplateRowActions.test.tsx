import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { api } from '@/services/api';
import { TemplateRowActions } from './TemplateRowActions';
import type { NotificationTemplate } from '../types';

const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    id: 'tpl-1',
    tenantId: 'agency-1',
    tenantName: 'Acme Realty',
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'S',
    body: 'B',
    active: true,
    notificationClass: 'OPERATIONAL',
    requiredVariables: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderRow(template: NotificationTemplate, canDelete: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onDeleted = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter>
          <TemplateRowActions template={template} onEdit={vi.fn()} onDeleted={onDeleted} canDelete={canDelete} />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { onDeleted };
}

beforeEach(() => {
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ data: null });
});

describe('TemplateRowActions', () => {
  it('shows Delete for an agency override when canDelete', () => {
    renderRow(makeTemplate({ tenantId: 'agency-1' }), true);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides Delete for a platform default even when canDelete', () => {
    renderRow(makeTemplate({ tenantId: null }), true);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('hides Delete when the actor cannot delete (non-global role)', () => {
    renderRow(makeTemplate({ tenantId: 'agency-1' }), false);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('confirms and calls DELETE, then notifies the parent', async () => {
    const user = userEvent.setup();
    const { onDeleted } = renderRow(makeTemplate({ id: 'override-9', tenantId: 'agency-1' }), true);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // Confirm dialog — click its Delete confirm button.
    const confirmButtons = screen.getAllByText('Delete');
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/v1/notification-templates/override-9');
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});
