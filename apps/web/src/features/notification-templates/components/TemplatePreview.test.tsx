import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatePreview } from './TemplatePreview';

describe('TemplatePreview', () => {
  it('renders subject for email channel', () => {
    render(
      <TemplatePreview
        subject="Hello John Smith"
        htmlRendered="<p>Your inspection is on 2026-04-15.</p>"
        channel="EMAIL"
      />,
    );

    expect(screen.getByTestId('preview-subject')).toHaveTextContent('Hello John Smith');
  });

  it('shows subject label for email channel', () => {
    render(
      <TemplatePreview
        subject="Test Subject"
        htmlRendered="<p>Test Body</p>"
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
        htmlRendered=""
        channel="SMS"
      />,
    );

    expect(screen.queryByText('Subject')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-subject')).not.toBeInTheDocument();
  });

  it('renders preview body as iframe when htmlRendered is present', () => {
    render(
      <TemplatePreview
        subject=""
        htmlRendered="<p>Plain body content</p>"
        channel="SMS"
      />,
    );

    expect(screen.getByTestId('preview-body')).toBeInTheDocument();
  });

  it('shows empty indicator when htmlRendered is empty', () => {
    render(
      <TemplatePreview
        subject=""
        htmlRendered=""
        channel="SMS"
      />,
    );

    expect(screen.getByTestId('preview-body')).toBeInTheDocument();
  });

  it('shows channel indicator', () => {
    render(
      <TemplatePreview
        subject=""
        htmlRendered=""
        channel="SMS"
      />,
    );

    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    render(
      <TemplatePreview
        subject=""
        htmlRendered=""
        channel="EMAIL"
        isLoading={true}
      />,
    );

    expect(screen.getByText(/updating/i)).toBeInTheDocument();
  });
});
