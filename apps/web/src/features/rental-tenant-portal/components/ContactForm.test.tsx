import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from './ContactForm';

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const mutateAsyncMock = vi.fn();
vi.mock('../hooks/usePortalData', () => ({
  useUpdateContact: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

const mockContact = {
  rentalTenantName: 'John Smith',
  primaryEmail: 'john@example.com',
  secondaryEmail: '',
  primaryPhone: '+61 400 000 000',
  secondaryPhone: '',
};

describe('ContactForm', () => {
  it('renders form fields and title', () => {
    render(<ContactForm contact={mockContact} token="test-token" isReadOnly={false} />);

    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText(/Name:/)).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0412 345 678')).toBeInTheDocument();
  });

  it('renders with null contact', () => {
    render(<ContactForm contact={null} token="test-token" isReadOnly={false} />);

    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.queryByText(/Name:/)).not.toBeInTheDocument();
  });

  it('shows error when submitting with no changes', async () => {
    const user = userEvent.setup();
    render(<ContactForm contact={null} token="test-token" isReadOnly={false} />);

    await user.click(screen.getByText('Update Contact'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please update at least one contact field.',
    );
  });

  it('calls mutation on valid submit', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ContactForm contact={null} token="test-token" isReadOnly={false} />);

    await user.type(screen.getByPlaceholderText('email@example.com'), 'new@test.com');
    await user.click(screen.getByText('Update Contact'));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ primaryEmail: 'new@test.com' }),
    );
  });

  it('disables editing when portal is read-only', () => {
    render(<ContactForm contact={mockContact} token="test-token" isReadOnly={true} />);

    expect(screen.getByPlaceholderText('email@example.com')).toBeDisabled();
    expect(screen.getByPlaceholderText('0412 345 678')).toBeDisabled();
    expect(screen.getByText('Update Contact')).toBeDisabled();
    expect(screen.getByText('This portal is read-only. Contact updates are no longer available.')).toBeInTheDocument();
  });
});
