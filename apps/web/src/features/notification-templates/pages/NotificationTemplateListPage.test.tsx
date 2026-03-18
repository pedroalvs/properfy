import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { NotificationTemplateListPage } from './NotificationTemplateListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TEMPLATES = [
  {
    id: 'tpl-01',
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    body: 'Hello {{tenant_name}}',
    active: true,
    requiredVariables: ['tenant_name'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-02',
    code: 'REMINDER_7D',
    channel: 'SMS',
    subject: '',
    body: 'Reminder: {{scheduled_date}}',
    active: false,
    requiredVariables: ['scheduled_date'],
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
];

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
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_TEMPLATES,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><NotificationTemplateListPage /></Wrapper>);
}

describe('NotificationTemplateListPage', () => {
  it('renders page title "Notification Templates"', () => {
    renderPage();
    expect(screen.getByText('Notification Templates')).toBeInTheDocument();
  });

  it('does not render a CTA button', () => {
    renderPage();
    expect(screen.queryByText('New Template')).not.toBeInTheDocument();
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('renders filter bar with search and channel controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Channel')).toBeInTheDocument();
  });

  it('renders data table with template data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('INSPECTION_NOTICE')).toBeInTheDocument();
    });
    expect(screen.getByText('REMINDER_7D')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    renderPage();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getAllByText('Channel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Subject').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
