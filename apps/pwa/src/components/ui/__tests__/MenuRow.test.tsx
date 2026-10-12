import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from 'lucide-react';
import { MenuRow, MenuList } from '../MenuRow';
import { PasswordInput } from '../PasswordInput';

describe('MenuRow', () => {
  it('renders a link row with label and sublabel', () => {
    render(
      <MemoryRouter>
        <MenuList>
          <MenuRow icon={<Home />} label="Earnings" sublabel="$840 this week" to="/earnings" data-testid="row-earnings" />
        </MenuList>
      </MemoryRouter>,
    );
    const link = screen.getByTestId('row-earnings');
    expect(link).toHaveAttribute('href', '/earnings');
    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('$840 this week')).toBeInTheDocument();
  });

  it('renders a button row that fires onClick', () => {
    const onClick = vi.fn();
    render(<MenuRow icon={<Home />} label="Log out" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('PasswordInput', () => {
  it('toggles visibility between password and text', () => {
    render(<PasswordInput aria-label="Password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
