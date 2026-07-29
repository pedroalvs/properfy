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
  rentalTenantName: null,
  code: 'INSPECTION_NOTICE',
  channel: 'EMAIL',
  subject: 'Inspection at {{propertyAddress}}',
  body: 'Hello {{rentalTenantName}}, your inspection is on {{scheduledDate}} at {{timeSlot}}.',
  active: true,
  notificationClass: 'OPERATIONAL',
  requiredVariables: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'timeSlot'],
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

const MOCK_SMS_TEMPLATE: NotificationTemplate = {
  id: 'tpl-02',
  tenantId: null,
  rentalTenantName: null,
  code: 'INSPECTION_NOTICE_SMS',
  channel: 'SMS',
  subject: '',
  body: 'Properfy: Hi {{rentalTenantName}}, inspection on {{scheduledDate}}.',
  active: true,
  notificationClass: 'OPERATIONAL',
  requiredVariables: ['rentalTenantName', 'scheduledDate'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('TemplateFormDrawer — SMS channel', () => {
  it('shows the stored SMS copy in the Body field', () => {
    renderDrawer(MOCK_SMS_TEMPLATE);
    expect(screen.getByLabelText('Body')).toHaveValue(
      'Properfy: Hi {{rentalTenantName}}, inspection on {{scheduledDate}}.',
    );
  });

  it('hides the Subject field — an SMS has no subject line', () => {
    renderDrawer(MOCK_SMS_TEMPLATE);
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
  });

  it('keeps the Subject field for EMAIL templates', () => {
    renderDrawer(MOCK_TEMPLATE);
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
  });

  it('blocks saving an SMS template with an empty body', async () => {
    const user = userEvent.setup();
    renderDrawer(MOCK_SMS_TEMPLATE);

    await user.clear(screen.getByLabelText('Body'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Body is required')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe('TemplateFormDrawer — reset to default', () => {
  const mockGet = api.GET as ReturnType<typeof vi.fn>;

  const OVERRIDE_TEMPLATE: NotificationTemplate = {
    ...MOCK_TEMPLATE,
    id: 'tpl-override',
    tenantId: 'tenant-1',
    rentalTenantName: 'Acme Realty',
    subject: 'Edited subject',
    body: 'Edited body {{rentalTenantName}} {{propertyAddress}} {{scheduledDate}} {{timeSlot}}',
  };

  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: {
          subject: 'Platform subject {{propertyAddress}}',
          body: 'Platform body {{rentalTenantName}} {{scheduledDate}} {{timeSlot}}',
          source: 'PLATFORM_DEFAULT',
        },
      },
      error: undefined,
    });
  });

  it('replaces the form content with the fetched default after confirming', async () => {
    const user = userEvent.setup();
    renderDrawer(OVERRIDE_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Body')).toHaveValue(
        'Platform body {{rentalTenantName}} {{scheduledDate}} {{timeSlot}}',
      );
    });
    expect(screen.getByLabelText('Subject')).toHaveValue('Platform subject {{propertyAddress}}');
  });

  it('asks for confirmation before discarding the operator edits', async () => {
    const user = userEvent.setup();
    renderDrawer(OVERRIDE_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));

    // Nothing is fetched or replaced until the operator confirms.
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Body')).toHaveValue(OVERRIDE_TEMPLATE.body);
  });

  it('does not persist anything — reset only stages the change for Save', async () => {
    const user = userEvent.setup();
    renderDrawer(OVERRIDE_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('sends tenantId when resetting an agency override', async () => {
    const user = userEvent.setup();
    renderDrawer(OVERRIDE_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL/default',
        { params: { query: { tenantId: 'tenant-1' } } },
      );
    });
  });

  it('omits tenantId when resetting the platform default itself', async () => {
    const user = userEvent.setup();
    renderDrawer(MOCK_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL/default',
        { params: { query: {} } },
      );
    });
  });

  // Safety net for the class of bug this work fixed: if a row ever arrives with
  // an empty body, the editor shows the standard content rather than a blank box
  // that silently saves nothing.
  it('auto-fills from the default when the loaded template has an empty body', async () => {
    renderDrawer({ ...MOCK_TEMPLATE, body: '' });

    await waitFor(() => {
      expect(screen.getByLabelText('Body')).toHaveValue(
        'Platform body {{rentalTenantName}} {{scheduledDate}} {{timeSlot}}',
      );
    });
  });

  it('does not auto-fill when the template already has a body', async () => {
    renderDrawer(OVERRIDE_TEMPLATE);

    await waitFor(() => {
      expect(screen.getByLabelText('Body')).toHaveValue(OVERRIDE_TEMPLATE.body);
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('leaves the form untouched when the fetch fails', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'boom' } } });
    const user = userEvent.setup();
    renderDrawer(OVERRIDE_TEMPLATE);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.getByLabelText('Body')).toHaveValue(OVERRIDE_TEMPLATE.body);
  });
});

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
      'Hello {{rentalTenantName}}, your inspection is on {{scheduledDate}} at {{timeSlot}}.',
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
    expect(screen.getByText('{{rentalTenantName}}, {{propertyAddress}}, {{scheduledDate}}, {{timeSlot}}')).toBeInTheDocument();
  });

  it('validates on save and shows errors for disallowed variables', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const bodyInput = screen.getByLabelText('Body');
    fireEvent.change(bodyInput, {
      target: { value: 'Hello {{bad_var}} {{rentalTenantName}} {{scheduledDate}}' },
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

  it('sends the override tenantId when editing an agency override', async () => {
    const user = userEvent.setup();
    renderDrawer({ ...MOCK_TEMPLATE, tenantId: 'agency-1', rentalTenantName: 'Acme Realty' });

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
        expect.objectContaining({ body: expect.objectContaining({ tenantId: 'agency-1' }) }),
      );
    });
  });

  it('omits tenantId when editing a platform default', async () => {
    const user = userEvent.setup();
    renderDrawer(MOCK_TEMPLATE); // tenantId: null

    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const body = mockPut.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.tenantId).toBeUndefined();
  });

  it('shows cancel and save buttons', () => {
    renderDrawer();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders backend VALIDATION_ERROR details inline on the matching fields', async () => {
    mockPut.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'bodyHtml', message: 'Missing required variable: scheduledDate' }],
        },
      },
    });

    const user = userEvent.setup();
    const { onSaved } = renderDrawer();

    await user.click(screen.getByText('Save'));

    expect(await screen.findByText('Missing required variable: scheduledDate')).toBeInTheDocument();
    // Fully mapped details render inline only — no summary snackbar.
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows active toggle', () => {
    renderDrawer();
    expect(screen.getByLabelText('Template active')).toBeInTheDocument();
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
