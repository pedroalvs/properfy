import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoLocationCapture } from '../GeoLocationCapture';

describe('GeoLocationCapture', () => {
  it('shows retry action for denied geolocation state', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();

    render(
      <GeoLocationCapture
        status="denied"
        location={null}
        error="Location permission denied."
        onRequest={onRequest}
      />,
    );

    await user.click(screen.getByTestId('geo-retry-button'));

    expect(onRequest).toHaveBeenCalledOnce();
  });
});
