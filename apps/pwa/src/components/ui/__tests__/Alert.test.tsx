import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '../Alert';

describe('Alert', () => {
  it('exposes an alert role and renders content', () => {
    render(
      <Alert tone="destructive">
        <AlertTitle>Failed</AlertTitle>
        <AlertDescription>Could not load</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed');
    expect(alert).toHaveTextContent('Could not load');
  });

  it('applies the tone token classes', () => {
    render(<Alert tone="warning">heads up</Alert>);
    expect(screen.getByRole('alert').className).toContain('bg-pill-amber');
  });

  it('defaults to the info tone', () => {
    render(<Alert>note</Alert>);
    expect(screen.getByRole('alert').className).toContain('bg-card');
  });
});
