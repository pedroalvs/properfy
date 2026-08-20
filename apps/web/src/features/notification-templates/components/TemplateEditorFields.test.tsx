import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, useCallback } from 'react';
import { TemplateEditorFields } from './TemplateEditorFields';
import type { TemplateFormData, TemplateFormErrors } from '../types';
import type { NotificationChannel } from '@properfy/shared';

function Harness({
  channel = 'EMAIL',
  initial = { subject: 'Hello', body: 'Body text', active: true },
}: {
  channel?: NotificationChannel | null;
  initial?: TemplateFormData;
}) {
  const [form, setForm] = useState<TemplateFormData>(initial);
  const updateField = useCallback(
    <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );
  const errors: TemplateFormErrors = {};
  return (
    <TemplateEditorFields
      form={form}
      errors={errors}
      updateField={updateField}
      channel={channel}
      variables={['rentalTenantName', 'scheduledDate']}
    />
  );
}

describe('TemplateEditorFields', () => {
  it('inserts a variable into the body by default (click)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText('Insert rentalTenantName'));
    expect(screen.getByLabelText('Body')).toHaveValue('Body text{{rentalTenantName}}');
    expect(screen.getByLabelText('Subject')).toHaveValue('Hello');
  });

  it('inserts a variable into the subject when it was the last-focused field', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const subject = screen.getByLabelText('Subject') as HTMLInputElement;
    await user.click(subject);
    subject.setSelectionRange(5, 5);

    await user.click(screen.getByLabelText('Insert scheduledDate'));
    expect(subject).toHaveValue('Hello{{scheduledDate}}');
    expect(screen.getByLabelText('Body')).toHaveValue('Body text');
  });

  it('inserts at the body cursor position, replacing a selection', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ subject: '', body: 'AAA BBB', active: true }} />);

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    await user.click(body);
    body.setSelectionRange(4, 7);

    await user.click(screen.getByLabelText('Insert rentalTenantName'));
    expect(body).toHaveValue('AAA {{rentalTenantName}}');
  });

  it('hides the Subject field on the SMS channel', () => {
    render(<Harness channel="SMS" />);
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('marks toolbar chips as draggable with a {{variable}} text payload', () => {
    render(<Harness />);
    const chip = screen.getByLabelText('Insert rentalTenantName');
    expect(chip).toHaveAttribute('draggable', 'true');

    const setData = vi.fn();
    fireEvent.dragStart(chip, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('text/plain', '{{rentalTenantName}}');
  });
});
