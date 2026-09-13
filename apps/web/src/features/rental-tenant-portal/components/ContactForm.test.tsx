import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  primaryPhone: '+61 400 000 000',
};

describe('ContactForm', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
  });

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

  // WI-W5 (#657): only changed fields are submitted; clicking Save with no edits
  // is not a false success.
  it('does not submit and shows a message when Save is clicked with no edits', async () => {
    const user = userEvent.setup();
    render(<ContactForm contact={mockContact} token="test-token" isReadOnly={false} />);

    await user.click(screen.getByText('Update Contact'));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please update at least one contact field.');
  });

  it('submits only the changed field (email), not the unchanged phone', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ContactForm contact={mockContact} token="test-token" isReadOnly={false} />);

    const email = screen.getByPlaceholderText('email@example.com');
    await user.clear(email);
    await user.type(email, 'changed@test.com');
    await user.click(screen.getByText('Update Contact'));

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const payload = mutateAsyncMock.mock.calls[0]![0];
    expect(payload).toEqual({ primaryEmail: 'changed@test.com' });
    expect(payload).not.toHaveProperty('primaryPhone');
  });

  it('does not treat a phone that only differs in formatting as a change', async () => {
    // Raw wire value vs. the formatted display value must normalize equal.
    const user = userEvent.setup();
    render(
      <ContactForm
        contact={{ rentalTenantName: '', primaryEmail: '', primaryPhone: '0400000000' }}
        token="test-token"
        isReadOnly={false}
      />,
    );

    await user.click(screen.getByText('Update Contact'));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please update at least one contact field.');
  });

  it('disables editing when portal is read-only', () => {
    render(<ContactForm contact={mockContact} token="test-token" isReadOnly={true} />);

    expect(screen.getByPlaceholderText('email@example.com')).toBeDisabled();
    expect(screen.getByPlaceholderText('0412 345 678')).toBeDisabled();
    expect(screen.getByText('Update Contact')).toBeDisabled();
    expect(screen.getByText('This portal is read-only. Contact updates are no longer available.')).toBeInTheDocument();
  });
});
