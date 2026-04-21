import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatePreview } from './TemplatePreview';

describe('TemplatePreview', () => {
  it('replaces variables with sample data', () => {
    render(
      <TemplatePreview
        subject="Hello {{tenantName}}"
        body="Your inspection at {{propertyAddress}} is on {{scheduledDate}}."
        channel="EMAIL"
      />,
    );

    expect(screen.getByTestId('preview-subject')).toHaveTextContent('Hello John Smith');
    expect(screen.getByTestId('preview-body')).toHaveTextContent(
      'Your inspection at 123 Main St, Sydney NSW 2000 is on 2026-04-15.',
    );
  });

  it('shows subject for email channel', () => {
    render(
      <TemplatePreview
        subject="Test Subject"
        body="Test Body"
        channel="EMAIL"
      />,
    );

    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByTestId('preview-subject')).toHaveTextContent('Test Subject');
  });

  it('hides subject for SMS channel', () => {
    render(
      <TemplatePreview
        subject="Test Subject"
        body="Test Body"
        channel="SMS"
      />,
    );

    expect(screen.queryByText('Subject')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-subject')).not.toBeInTheDocument();
  });

  it('hides subject for SMS channel', () => {
    render(
      <TemplatePreview
        subject="Test Subject"
        body="Test Body"
        channel="SMS"
      />,
    );

    expect(screen.queryByText('Subject')).not.toBeInTheDocument();
  });

  it('renders body text', () => {
    render(
      <TemplatePreview
        subject=""
        body="Plain body content"
        channel="SMS"
      />,
    );

    expect(screen.getByTestId('preview-body')).toHaveTextContent('Plain body content');
  });

  it('preserves unknown variables as-is', () => {
    render(
      <TemplatePreview
        subject=""
        body="Hello {{unknown_var}}"
        channel="SMS"
      />,
    );

    expect(screen.getByTestId('preview-body')).toHaveTextContent('Hello {{unknown_var}}');
  });

  it('shows channel indicator', () => {
    render(
      <TemplatePreview
        subject=""
        body="Text"
        channel="SMS"
      />,
    );

    expect(screen.getByText('SMS')).toBeInTheDocument();
  });
});
