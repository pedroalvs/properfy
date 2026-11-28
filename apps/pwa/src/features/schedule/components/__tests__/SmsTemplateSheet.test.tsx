import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmsTemplateSheet } from '../SmsTemplateSheet';

function renderSheet(props: Partial<React.ComponentProps<typeof SmsTemplateSheet>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <SmsTemplateSheet
      open
      onOpenChange={onOpenChange}
      contactName="Jane Doe"
      phone="+61400000000"
      firstName="Carlos"
      {...props}
    />,
  );
  return { onOpenChange };
}

describe('SmsTemplateSheet', () => {
  it('renders nothing while closed', () => {
    render(
      <SmsTemplateSheet open={false} onOpenChange={vi.fn()} contactName="Jane Doe" phone="+61400000000" />,
    );
    expect(screen.queryByTestId('sms-template-on-my-way')).not.toBeInTheDocument();
  });

  it('shows the contact name and number in the header', () => {
    renderSheet();
    expect(screen.getByText('Message Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('+61400000000')).toBeInTheDocument();
  });

  it('renders all five templates as sms: links addressed to the contact and signed with the name', () => {
    renderSheet();
    const rows = screen.getAllByTestId(/^sms-template-/);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const href = row.getAttribute('href') ?? '';
      expect(href.startsWith('sms:+61400000000')).toBe(true);
      expect(href).toContain('body=');
      expect(href).toContain('Carlos');
    }
  });

  it('falls back to a generic signature when no first name is given', () => {
    renderSheet({ firstName: undefined });
    const href = screen.getByTestId('sms-template-on-my-way').getAttribute('href') ?? '';
    expect(href).toContain(encodeURIComponent('your property inspector'));
    expect(href).not.toContain('Carlos');
  });

  it('closes when a template is tapped', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet();
    await user.click(screen.getByTestId('sms-template-waiting-outside'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes when Cancel is tapped', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
