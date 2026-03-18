import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotFoundPage } from './NotFoundPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('NotFoundPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders 404 heading', () => {
    render(<NotFoundPage />);
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<NotFoundPage />);
    expect(screen.getByText("The page you're looking for doesn't exist.")).toBeInTheDocument();
  });

  it('renders alert icon', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.querySelector('.mdi-alert-circle-outline')).toBeTruthy();
  });

  it('navigates to dashboard on button click', async () => {
    const user = userEvent.setup();
    render(<NotFoundPage />);
    await user.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
