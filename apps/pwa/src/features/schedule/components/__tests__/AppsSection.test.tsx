import { render, screen } from '@testing-library/react';
import { AppsSection } from '../AppsSection';

const apps = [
  { id: 'a1', name: 'Airbnb', username: 'host@example.com', password: 's3cr3t' },
  { id: 'a2', name: 'Booking', username: 'mgr', password: 'p@ss' },
];

describe('AppsSection', () => {
  it('renders nothing when there are no apps', () => {
    const { container } = render(<AppsSection apps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each app name, username and password in plaintext', () => {
    render(<AppsSection apps={apps} />);
    expect(screen.getByText('Airbnb')).toBeInTheDocument();
    expect(screen.getByText('host@example.com')).toBeInTheDocument();
    expect(screen.getByText('s3cr3t')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
    expect(screen.getByText('p@ss')).toBeInTheDocument();
  });

  it('renders one item per app', () => {
    render(<AppsSection apps={apps} />);
    expect(screen.getAllByTestId('apps-section-item')).toHaveLength(2);
  });
});
