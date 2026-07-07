import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactsSection } from '../ContactsSection';
import type { JobDetailsTenantContact } from '../../types';

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

  it('renders tel:/mailto: actions for primary phone and email', () => {
    render(<ContactsSection contacts={[primary]} />);
    expect(screen.getByTestId('contact-phone-link-0')).toHaveAttribute('href', 'tel:+61400000000');
    expect(screen.getByTestId('contact-email-link-0')).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('renders additional channels with labels and actionable links', () => {
    render(<ContactsSection contacts={[primary]} />);
    const extraPhone = screen.getByTestId('contact-extra-channel-0-0');
    expect(extraPhone).toHaveAttribute('href', 'tel:+61411111111');
    expect(extraPhone).toHaveTextContent('+61411111111');
    expect(extraPhone).toHaveTextContent('Work');
    const extraEmail = screen.getByTestId('contact-extra-channel-0-1');
    expect(extraEmail).toHaveAttribute('href', 'mailto:alt@example.com');
  });

  it('shows a fallback note when a contact has no reachable details', () => {
    render(<ContactsSection contacts={[{ name: 'Silent Sam', email: null, phone: null, role: 'OTHER', isPrimary: false }]} />);
    expect(screen.getByText('No contact details available.')).toBeInTheDocument();
  });
});
