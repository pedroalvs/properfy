import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { StopCard } from '../StopCard';
import { CallContactLink } from '../CallContactLink';
import { buildStop } from '../../__fixtures__/day-plan';

describe('StopCard', () => {
  it('next variant shows the label, ETA, address, meta, call and Navigate', () => {
    renderWithProviders(
      <StopCard
        variant="next"
        stop={buildStop({
          eta: '2026-11-04T21:00:00.000Z', // 08:00 Sydney
          travelS: 600,
          distanceM: 4700,
        })}
      />,
    );
    expect(screen.getByText('NEXT INSPECTION')).toBeInTheDocument();
    expect(screen.getByText('ETA 8:00 am')).toBeInTheDocument();
    expect(screen.getByText('12 King St, Surry Hills NSW 2010')).toBeInTheDocument();
    expect(screen.getByText('Window 8:00 am – 5:00 pm · 10 min · 4.7 km')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call Sam Lee (tenant)' })).toHaveAttribute(
      'href',
      'tel:+61412345678',
    );
    expect(
      screen.getByRole('link', { name: /Navigate to 12 King St, Surry Hills NSW 2010 \(opens maps\)/ }),
    ).toBeInTheDocument();
  });

  it('next variant renders the IN PROGRESS label and chips', () => {
    renderWithProviders(
      <StopCard
        variant="next"
        stop={buildStop({
          executionStatus: 'IN_PROGRESS',
          executed: true,
          keyRequired: true,
          meetingLocation: 'Front desk',
          waitS: 1500,
          lateS: 900,
        })}
      />,
    );
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('Key required')).toBeInTheDocument();
    expect(screen.getByText('Meet at: Front desk')).toBeInTheDocument();
    expect(screen.getByText('Wait 25 min for window')).toBeInTheDocument();
    expect(screen.getByText('Arrives after window')).toBeInTheDocument();
  });

  it('row variant: number, address, suburb·window, ETA, and body links to the detail', () => {
    renderWithProviders(
      <StopCard
        variant="row"
        stop={buildStop({
          sequence: 2,
          appointmentId: '22222222-2222-4222-8222-222222222222',
          propertyAddress: '2/246 Willoughby Rd',
          suburb: 'Naremburn',
          eta: '2026-11-04T22:01:00.000Z', // 09:01 Sydney
        })}
      />,
    );
    const item = screen.getByRole('article', { name: 'Stop 2, 2/246 Willoughby Rd, ETA 9:01 am' });
    const link = within(item).getByRole('link');
    expect(link).toHaveAttribute('href', '/schedule/22222222-2222-4222-8222-222222222222');
    expect(within(item).getByText(/Naremburn · 8:00 am – 5:00 pm/)).toBeInTheDocument();
  });

  it('row variant shows Done / In progress instead of an ETA', () => {
    const { rerender } = renderWithProviders(
      <StopCard variant="row" stop={buildStop({ appointmentStatus: 'DONE', executed: true })} />,
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
    rerender(<StopCard variant="row" stop={buildStop({ executionStatus: 'IN_PROGRESS', executed: true })} />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('row variant notes missing coordinates', () => {
    renderWithProviders(<StopCard variant="row" stop={buildStop({ missingCoordinates: true })} />);
    expect(screen.getByText('Location not found for this address')).toBeInTheDocument();
  });

  it('never nests an interactive element inside the body link', () => {
    const { container } = renderWithProviders(
      <StopCard variant="next" stop={buildStop()} />,
    );
    expect(container.querySelector('a a')).toBeNull();
    expect(container.querySelector('button button')).toBeNull();
    expect(container.querySelector('a button')).toBeNull();
  });
});

describe('CallContactLink', () => {
  it('labels the link with the contact role', () => {
    const { rerender } = renderWithProviders(
      <CallContactLink
        contact={{ name: 'Sam Lee', phone: '+61412345678', role: 'PROPERTY_MANAGER' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Call Sam Lee (property manager)' })).toBeInTheDocument();

    rerender(<CallContactLink contact={{ name: 'Sam Lee', phone: '+61412345678', role: 'OTHER' }} />);
    expect(screen.getByRole('link', { name: 'Call Sam Lee' })).toBeInTheDocument();
  });

  it('renders nothing without a phone number', () => {
    const { container } = renderWithProviders(
      <CallContactLink contact={{ name: 'Sam Lee', phone: null, role: 'RENTAL_TENANT' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
