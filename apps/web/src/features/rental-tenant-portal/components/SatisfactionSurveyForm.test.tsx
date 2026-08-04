import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SatisfactionSurveyForm } from './SatisfactionSurveyForm';

function setup(props: Partial<React.ComponentProps<typeof SatisfactionSurveyForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<SatisfactionSurveyForm onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => {
  setOnline(true);
});

describe('SatisfactionSurveyForm', () => {
  it('keeps submit disabled until a rating is picked', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByRole('button', { name: /submit rating/i })).toBeDisabled();

    await user.click(screen.getAllByRole('radio')[4]!);

    expect(screen.getByRole('button', { name: /submit rating/i })).toBeEnabled();
  });

  it('submits the rating and the comment exactly once', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.click(screen.getAllByRole('radio')[4]!);
    await user.type(screen.getByLabelText(/comment/i), 'Great work');
    await user.click(screen.getByRole('button', { name: /submit rating/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ rating: 5, comment: 'Great work' });
  });

  it('omits the comment entirely when left blank', async () => {
    // An empty string is not the same as "no comment" — the API treats absent as
    // null, and sending '' would store a meaningless empty response.
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.click(screen.getAllByRole('radio')[3]!);
    await user.click(screen.getByRole('button', { name: /submit rating/i }));

    expect(onSubmit).toHaveBeenCalledWith({ rating: 4 });
  });

  it('caps the comment and shows a live counter', async () => {
    const user = userEvent.setup();
    setup();

    const textarea = screen.getByLabelText(/comment/i);
    expect(textarea).toHaveAttribute('maxLength', '500');

    await user.type(textarea, 'Hello');
    expect(screen.getByText('5/500')).toBeInTheDocument();
  });

  it('locks every control while the submission is in flight', async () => {
    // Stars, textarea and button all: a slow network must not allow a second
    // POST or a rating change mid-flight.
    setup({ isSubmitting: true, value: 5 });

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    expect(screen.getByLabelText(/comment/i)).toBeDisabled();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
  });

  it('shows a failure without faking success and keeps retry possible', async () => {
    const user = userEvent.setup();
    render(
      <SatisfactionSurveyForm
        onSubmit={vi.fn().mockRejectedValue(new Error('network'))}
        errorMessage="Could not submit your rating. Please try again."
      />,
    );

    await user.click(screen.getAllByRole('radio')[4]!);
    await user.click(screen.getByRole('button', { name: /submit rating/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/could not submit/i);
    expect(screen.getByRole('button', { name: /submit rating/i })).toBeEnabled();
  });

  it('blocks submission while offline', async () => {
    // One immutable submission plus a background queue would lose or duplicate
    // the answer, so the form refuses rather than queueing.
    const user = userEvent.setup();
    setup();

    await user.click(screen.getAllByRole('radio')[4]!);
    setOnline(false);

    expect(await screen.findByRole('button', { name: /submit rating/i })).toBeDisabled();
  });

  it('states who sees the answer before it is given', async () => {
    setup();

    expect(screen.getByText(/never your name or comment/i)).toBeInTheDocument();
  });

  it('names the inspector being rated when known', () => {
    setup({ inspectorName: 'James Roberts' });

    expect(screen.getByText(/james roberts/i)).toBeInTheDocument();
  });
});
