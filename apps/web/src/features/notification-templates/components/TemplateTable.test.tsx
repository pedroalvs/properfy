import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { TemplateTable } from './TemplateTable';
import type { NotificationTemplate } from '../types';

// Rows mount TemplateRowActions, which uses React Query + Snackbar.
function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: AllProviders });
}

function makeTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    id: 'tpl-1',
    tenantId: null,
    tenantName: null,
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    body: 'Hello {{tenant_name}}',
    active: true,
    notificationClass: 'OPERATIONAL',
    requiredVariables: ['tenant_name'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TemplateTable', () => {
  it('renders column headers', () => {
    render(<TemplateTable data={[]} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Agency')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders template data', () => {
    const template = makeTemplate();
    render(<TemplateTable data={[template]} />);
    expect(screen.getByText('Inspection Notice')).toBeInTheDocument();
    expect(screen.getByText('Platform Default')).toBeInTheDocument();
    expect(screen.getByText('Inspection Scheduled')).toBeInTheDocument();
  });

  it('shows agency override scope when tenant-specific', () => {
    const template = makeTemplate({ tenantId: 'tenant-1' });
    render(<TemplateTable data={[template]} />);
    expect(screen.getByText('Agency Override')).toBeInTheDocument();
  });

  it('shows the owning agency name for overrides', () => {
    const template = makeTemplate({ tenantId: 'tenant-1', tenantName: 'Acme Realty' });
    render(<TemplateTable data={[template]} />);
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
  });

  it('shows em dash in the Agency column for platform defaults', () => {
    const template = makeTemplate({ tenantId: null, tenantName: null, subject: 'Has subject' });
    render(<TemplateTable data={[template]} />);
    // Subject is present, so the only em dash comes from the Agency column.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows channel chips with correct text', () => {
    const templates = [
      makeTemplate({ id: 'tpl-1', channel: 'EMAIL' }),
      makeTemplate({ id: 'tpl-2', channel: 'SMS', code: 'REMINDER_7D' }),
      makeTemplate({ id: 'tpl-3', channel: 'SMS', code: 'ALERT' }),
    ];
    render(<TemplateTable data={templates} />);
    expect(screen.getByText('EMAIL')).toBeInTheDocument();
    expect(screen.getAllByText('SMS').length).toBeGreaterThanOrEqual(2);
  });

  it('shows active boolean icon for active templates', () => {
    const template = makeTemplate({ active: true });
    render(<TemplateTable data={[template]} />);
    expect(screen.getByLabelText('Active')).toBeInTheDocument();
  });

  it('shows inactive boolean icon for inactive templates', () => {
    const template = makeTemplate({ active: false });
    render(<TemplateTable data={[template]} />);
    expect(screen.getByLabelText('Inactive')).toBeInTheDocument();
  });

  it('shows em dash when subject is empty', () => {
    const template = makeTemplate({ subject: '' });
    render(<TemplateTable data={[template]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no data', () => {
    render(<TemplateTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('edit action calls onEdit with correct template', async () => {
    const userEvt = userEvent.setup();
    const onEdit = vi.fn();
    const template = makeTemplate();
    render(<TemplateTable data={[template]} onEdit={onEdit} />);
    await userEvt.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(template);
  });
});
