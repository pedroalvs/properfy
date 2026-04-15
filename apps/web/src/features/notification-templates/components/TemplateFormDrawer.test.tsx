import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { TemplateFormDrawer } from './TemplateFormDrawer';
import type { NotificationTemplate } from '../types';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;

const MOCK_TEMPLATE: NotificationTemplate = {
  id: 'tpl-01',
  tenantId: null,
  code: 'INSPECTION_NOTICE',
  channel: 'EMAIL',
  subject: 'Inspection at {{propertyAddress}}',
  body: 'Hello {{tenantName}}, your inspection is on {{scheduledDate}}.',
  active: true,
  notificationClass: 'OPERATIONAL',
  requiredVariables: ['tenantName', 'scheduledDate'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({ data: { data: { id: 'tpl-01' } } });
});

function renderDrawer(template: NotificationTemplate | null = MOCK_TEMPLATE) {
  const Wrapper = createWrapper();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  return {
    ...render(
      <Wrapper>
        <TemplateFormDrawer
          open={true}
          onClose={onClose}
          template={template}
          onSaved={onSaved}
        />
      </Wrapper>,
    ),
    onClose,
    onSaved,
  };
}

describe('TemplateFormDrawer', () => {
  it('renders form fields', () => {
    renderDrawer();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('shows template code in title', () => {
    renderDrawer();
    expect(screen.getByText('Edit Template: INSPECTION_NOTICE')).toBeInTheDocument();
  });

  it('shows variable toolbar', () => {
    renderDrawer();
    expect(screen.getByRole('toolbar', { name: 'Insert variable' })).toBeInTheDocument();
  });

  it('shows preview section', () => {
    renderDrawer();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('populates form with template data', () => {
    renderDrawer();
    expect(screen.getByLabelText('Subject')).toHaveValue('Inspection at {{propertyAddress}}');
    expect(screen.getByLabelText('Body')).toHaveValue(
      'Hello {{tenantName}}, your inspection is on {{scheduledDate}}.',
    );
  });

  it('shows template info bar with code and channel', () => {
    renderDrawer();
    expect(screen.getByText('INSPECTION_NOTICE')).toBeInTheDocument();
    expect(screen.getAllByText('EMAIL').length).toBeGreaterThanOrEqual(1);
  });

  it('shows required variables in info bar', () => {
    renderDrawer();
    expect(screen.getByText('Required Variables')).toBeInTheDocument();
    expect(screen.getByText('{{tenantName}}, {{scheduledDate}}')).toBeInTheDocument();
  });

  it('validates on save and shows errors for disallowed variables', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const bodyInput = screen.getByLabelText('Body');
    fireEvent.change(bodyInput, {
      target: { value: 'Hello {{bad_var}} {{tenantName}} {{scheduledDate}}' },
    });

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText(/Invalid variables/)).toBeInTheDocument();
    });
  });

  it('calls save on valid form submission', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDrawer();

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
        expect.objectContaining({ body: expect.any(Object) }),
      );
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows cancel and save buttons', () => {
    renderDrawer();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('shows active toggle', () => {
    renderDrawer();
    expect(screen.getByLabelText('Template active')).toBeInTheDocument();
  });
});
