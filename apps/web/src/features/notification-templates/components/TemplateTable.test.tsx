import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateTable } from './TemplateTable';
import type { NotificationTemplate } from '../types';

function makeTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    id: 'tpl-1',
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    body: 'Hello {{tenant_name}}',
    active: true,
    requiredVariables: ['tenant_name'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TemplateTable', () => {
  it('renders column headers', () => {
    render(<TemplateTable data={[]} />);
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders template data', () => {
    const template = makeTemplate();
    render(<TemplateTable data={[template]} />);
    expect(screen.getByText('INSPECTION_NOTICE')).toBeInTheDocument();
    expect(screen.getByText('Inspection Scheduled')).toBeInTheDocument();
  });

  it('shows channel chips with correct text', () => {
    const templates = [
      makeTemplate({ id: 'tpl-1', channel: 'EMAIL' }),
      makeTemplate({ id: 'tpl-2', channel: 'SMS', code: 'REMINDER_7D' }),
      makeTemplate({ id: 'tpl-3', channel: 'WHATSAPP', code: 'ALERT' }),
    ];
    render(<TemplateTable data={templates} />);
    expect(screen.getByText('EMAIL')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.getByText('WHATSAPP')).toBeInTheDocument();
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
