import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AddressNotVerifiedAlert } from './AddressNotVerifiedAlert';

describe('AddressNotVerifiedAlert', () => {
  it('offers the manual-pin escape with the "Can\'t locate this address?" label', () => {
    render(<AddressNotVerifiedAlert reason="NOT_FOUND" onSetManual={() => {}} />);

    expect(screen.getByText("Can't locate this address?")).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set location manually' }),
    ).toBeInTheDocument();
    // The old wording must be gone.
    expect(screen.queryByText('Rural property?')).not.toBeInTheDocument();
  });

  it('omits the manual-pin escape when onSetManual is not provided', () => {
    render(<AddressNotVerifiedAlert reason="NOT_FOUND" />);

    expect(screen.queryByText("Can't locate this address?")).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set location manually' }),
    ).not.toBeInTheDocument();
  });
});
