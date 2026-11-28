import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsSection } from '../ContactsSection';
import type { JobDetailsTenantContact } from '../../types';

// ContactsSection reads the logged-in inspector's name via useAuth to sign SMS
// templates. Mock it so the component renders without an AuthProvider.
let mockUser: { name: string } | null = { name: 'John Smith' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const primary: JobDetailsTenantContact = {
  name: 'John Smith',
  email: 'john@example.com',
  phone: '+61400000000',
  role: 'RENTAL_TENANT',
  isPrimary: true,
  type: 'INDIVIDUAL',
  company: null,
  additionalChannels: [
    { channel: 'PHONE', value: '+61411111111', label: 'Work' },
    { channel: 'EMAIL', value: 'alt@example.com' },
  ],
};

const rep: JobDetailsTenantContact = {
  name: 'Jane Rep',
  email: null,
  phone: '+61422222222',
  role: 'RENTAL_TENANT_REPRESENTATIVE',
  isPrimary: false,
  company: 'Acme Realty',
};

beforeEach(() => {
  mockUser = { name: 'Carlos Mendes' };
});

describe('ContactsSection', () => {
  it('renders nothing when there are no contacts', () => {
    const { container } = render(<ContactsSection contacts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders every contact with name, role label and primary badge', () => {
    render(<ContactsSection contacts={[primary, rep]} />);

    expect(screen.getAllByTestId('contact-item')).toHaveLength(2);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Rep')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.getByText('Representative')).toBeInTheDocument();
    expect(screen.getByTestId('contact-primary-badge')).toBeInTheDocument();
  });

  it('renders company when present', () => {
    render(<ContactsSection contacts={[rep]} />);
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
  });

  it('renders a tel: action for the phone and never shows the email', () => {
    render(<ContactsSection contacts={[primary]} />);
    expect(screen.getByTestId('contact-phone-link-0')).toHaveAttribute('href', 'tel:+61400000000');
    expect(screen.queryByTestId('contact-email-link-0')).not.toBeInTheDocument();
    expect(screen.queryByText('john@example.com')).not.toBeInTheDocument();
  });

  it('renders additional phone channels and filters out EMAIL channels', () => {
    render(<ContactsSection contacts={[primary]} />);
    const extraPhone = screen.getByTestId('contact-extra-channel-0-0');
    expect(extraPhone).toHaveAttribute('href', 'tel:+61411111111');
    expect(extraPhone).toHaveTextContent('+61411111111');
    expect(extraPhone).toHaveTextContent('Work');
    expect(screen.queryByTestId('contact-extra-channel-0-1')).not.toBeInTheDocument();
    expect(screen.queryByText('alt@example.com')).not.toBeInTheDocument();
  });

  it('shows a fallback note when a contact has no reachable details', () => {
    render(<ContactsSection contacts={[{ name: 'Silent Sam', email: null, phone: null, role: 'OTHER', isPrimary: false }]} />);
    expect(screen.getByText('No contact details available.')).toBeInTheDocument();
  });

  it('shows the fallback note when a contact only has an email', () => {
    render(
      <ContactsSection
        contacts={[
          {
            name: 'Email Only',
            email: 'only@example.com',
            phone: null,
            role: 'OTHER',
            isPrimary: false,
            additionalChannels: [{ channel: 'EMAIL', value: 'extra@example.com' }],
          },
        ]}
      />,
    );
    expect(screen.getByText('No contact details available.')).toBeInTheDocument();
    expect(screen.queryByText('only@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('extra@example.com')).not.toBeInTheDocument();
  });

  it('shows a Message button for a contact with a phone', () => {
    render(<ContactsSection contacts={[primary]} />);
    expect(screen.getByTestId('contact-sms-button-0')).toBeInTheDocument();
  });

  it('does not show a Message button for a contact without a phone', () => {
    render(
      <ContactsSection contacts={[{ name: 'Silent Sam', email: null, phone: null, role: 'OTHER', isPrimary: false }]} />,
    );
    expect(screen.queryByTestId('contact-sms-button-0')).not.toBeInTheDocument();
  });

  it('opens the SMS template sheet, addressed to the tapped contact and signed with the inspector first name', async () => {
    const user = userEvent.setup();
    render(<ContactsSection contacts={[primary]} />);

    expect(screen.queryByTestId('sms-template-on-my-way')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('contact-sms-button-0'));

    expect(screen.getByText('Message John Smith')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^sms-template-/)).toHaveLength(5);

    const onMyWay = screen.getByTestId('sms-template-on-my-way');
    const href = onMyWay.getAttribute('href') ?? '';
    expect(href.startsWith('sms:+61400000000')).toBe(true);
    // Signed with the inspector's first name (encodeURIComponent leaves letters intact).
    expect(href).toContain('Carlos');
  });
});
