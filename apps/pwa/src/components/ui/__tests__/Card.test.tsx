import { render, screen } from '@testing-library/react';
import { Card, CardTitle, CardContent } from '../Card';

describe('Card', () => {
  it('renders composed content', () => {
    render(
      <Card>
        <CardTitle>Tue 22 Sept</CardTitle>
        <CardContent>12 jobs</CardContent>
      </Card>,
    );
    expect(screen.getByText('Tue 22 Sept')).toBeInTheDocument();
    expect(screen.getByText('12 jobs')).toBeInTheDocument();
  });

  it('uses the card surface tokens', () => {
    const { container } = render(<Card>body</Card>);
    expect(container.firstElementChild?.className).toContain('bg-card');
    expect(container.firstElementChild?.className).toContain('rounded-card');
  });

  it('merges a caller className', () => {
    const { container } = render(<Card className="p-0">body</Card>);
    expect(container.firstElementChild?.className).toContain('p-0');
  });
});
