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
  body: 'Hello {{tenantName}}, your inspection is on {{scheduledDate}} at {{timeSlot}}.',
  active: true,
  notificationClass: 'OPERATIONAL',
  requiredVariables: ['tenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
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
      'Hello {{tenantName}}, your inspection is on {{scheduledDate}} at {{timeSlot}}.',
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
    expect(screen.getByText('{{tenantName}}, {{propertyAddress}}, {{scheduledDate}}, {{timeSlot}}')).toBeInTheDocument();
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

  it('shows Images button in toolbar for EMAIL template', () => {
    renderDrawer(MOCK_TEMPLATE);
    expect(screen.getByRole('button', { name: 'Open image library' })).toBeInTheDocument();
  });

  it('does not show Images button in toolbar for SMS template', () => {
    renderDrawer({ ...MOCK_TEMPLATE, channel: 'SMS' });
    expect(screen.queryByRole('button', { name: 'Open image library' })).not.toBeInTheDocument();
  });

  it('shows Send Test Email button for EMAIL template', () => {
    renderDrawer(MOCK_TEMPLATE);
    expect(screen.getByRole('button', { name: 'Send Test Email' })).toBeInTheDocument();
  });

  it('does not show Send Test Email for SMS template', () => {
    renderDrawer({ ...MOCK_TEMPLATE, channel: 'SMS' });
    expect(screen.queryByRole('button', { name: 'Send Test Email' })).not.toBeInTheDocument();
  });

  it('renders preview section when EMAIL template is open', () => {
    renderDrawer(MOCK_TEMPLATE);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByTestId('preview-body')).toBeInTheDocument();
  });

  it('does not render Images button when template is null', () => {
    renderDrawer(null);
    expect(screen.queryByRole('button', { name: 'Open image library' })).not.toBeInTheDocument();
  });

  it('shows Images button after template prop changes from null to EMAIL (open drawer transition)', () => {
    // Simulates the real-browser scenario: drawer is always mounted (DrawerPanel keeps children),
    // initially template=null (page load), then template is set when the user clicks Edit.
    const Wrapper = createWrapper();
    const { rerender } = render(
      <Wrapper>
        <TemplateFormDrawer open={false} onClose={vi.fn()} template={null} onSaved={vi.fn()} />
      </Wrapper>,
    );

    // Images must not appear while drawer is closed and template is null
    expect(screen.queryByRole('button', { name: 'Open image library' })).not.toBeInTheDocument();

    // Simulate handleEdit: open=true + template=<EMAIL template> (React batches these)
    rerender(
      <Wrapper>
        <TemplateFormDrawer open={true} onClose={vi.fn()} template={MOCK_TEMPLATE} onSaved={vi.fn()} />
      </Wrapper>,
    );

    // After opening with EMAIL template, Images button MUST appear
    expect(screen.getByRole('button', { name: 'Open image library' })).toBeInTheDocument();
  });

  it('preview section renders for EMAIL template even before form state syncs body', async () => {
    // Regression: useTemplatePreview must be called with a non-empty body from the very
    // first render so the preview iframe is available immediately when the drawer opens,
    // not only after the useEffect syncs form state on a second render cycle.
    const mockPost = api.POST as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({
      data: { data: { subjectRendered: 'Test Subject', htmlRendered: '<p>Hello</p>' } },
      error: undefined,
    });

    vi.useFakeTimers();
    try {
      renderDrawer(MOCK_TEMPLATE);
      // Advance past the 400 ms debounce in useTemplatePreview
      await vi.advanceTimersByTimeAsync(500);

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/preview'),
        expect.objectContaining({
          body: expect.objectContaining({ bodyHtml: expect.any(String) }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
