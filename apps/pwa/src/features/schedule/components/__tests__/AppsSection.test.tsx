import { render, screen, fireEvent } from '@testing-library/react';
import type { AppointmentApp } from '@properfy/shared';
import { AppsSection } from '../AppsSection';

function makeApp(overrides: Partial<AppointmentApp> = {}): AppointmentApp {
  return {
    id: 'a1',
    name: 'Airbnb',
    username: 'host@example.com',
    password: 's3cr3t',
    needsAuthCode: false,
    authCode: null,
    appUrl: null,
    instructionsUrl: null,
    instructionsPassword: null,
    ...overrides,
  };
}

describe('AppsSection', () => {
  it('renders nothing when there are no apps', () => {
    const { container } = render(<AppsSection apps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each app name, username and password in plaintext', () => {
    render(<AppsSection apps={[makeApp(), makeApp({ id: 'a2', name: 'Booking', username: 'mgr', password: 'p@ss' })]} />);
    expect(screen.getByText('Airbnb')).toBeInTheDocument();
    expect(screen.getByText('host@example.com')).toBeInTheDocument();
    expect(screen.getByText('s3cr3t')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
    expect(screen.getByText('p@ss')).toBeInTheDocument();
  });

  it('renders one item per app', () => {
    render(<AppsSection apps={[makeApp(), makeApp({ id: 'a2' })]} />);
    expect(screen.getAllByTestId('apps-section-item')).toHaveLength(2);
  });

  it('renders all new rows when the fields are present', () => {
    render(
      <AppsSection
        apps={[
          makeApp({
            needsAuthCode: true,
            authCode: '123456',
            appUrl: 'https://app.example.com',
            instructionsUrl: 'https://docs.example.com',
            instructionsPassword: 'openme',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('apps-section-auth-code')).toHaveTextContent('123456');
    expect(screen.getByTestId('apps-section-instructions-password')).toHaveTextContent('openme');

    const openApp = screen.getByTestId('apps-section-open-app');
    expect(openApp).toHaveAttribute('href', 'https://app.example.com');
    expect(openApp).toHaveAttribute('target', '_blank');
    expect(openApp).toHaveAttribute('rel', 'noreferrer');

    const instructions = screen.getByTestId('apps-section-instructions');
    expect(instructions).toHaveAttribute('href', 'https://docs.example.com');
  });

  it('hides new rows when the fields are null', () => {
    render(<AppsSection apps={[makeApp()]} />);
    expect(screen.queryByTestId('apps-section-auth-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('apps-section-instructions-password')).not.toBeInTheDocument();
    expect(screen.queryByTestId('apps-section-open-app')).not.toBeInTheDocument();
    expect(screen.queryByTestId('apps-section-instructions')).not.toBeInTheDocument();
  });

  it('hides the auth code row when authCode is present but needsAuthCode is false', () => {
    render(<AppsSection apps={[makeApp({ needsAuthCode: false, authCode: '999' })]} />);
    expect(screen.queryByTestId('apps-section-auth-code')).not.toBeInTheDocument();
  });

  it('copies the field value to the clipboard when a credential row is tapped', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<AppsSection apps={[makeApp({ needsAuthCode: true, authCode: '123456' })]} />);

    fireEvent.click(screen.getByTestId('apps-section-password'));
    expect(writeText).toHaveBeenCalledWith('s3cr3t');

    fireEvent.click(screen.getByTestId('apps-section-auth-code'));
    expect(writeText).toHaveBeenCalledWith('123456');
  });
});
