import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentUploadField } from '../DocumentUploadField';

describe('DocumentUploadField', () => {
  it('renders the label', () => {
    render(<DocumentUploadField label="Insurance Certificate" onFile={vi.fn()} />);
    expect(screen.getByText('Insurance Certificate')).toBeInTheDocument();
  });

  it('shows currentFileName when provided', () => {
    render(<DocumentUploadField label="Insurance Certificate" currentFileName="insurance.pdf" onFile={vi.fn()} />);
    expect(screen.getByText('insurance.pdf')).toBeInTheDocument();
  });

  it('shows "Upload" label when no currentFileName', () => {
    render(<DocumentUploadField label="Insurance Certificate" onFile={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('shows "Replace" label when currentFileName is present', () => {
    render(<DocumentUploadField label="Insurance Certificate" currentFileName="old.pdf" onFile={vi.fn()} />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
  });

  it('calls onFile when a file is selected', () => {
    const onFile = vi.fn();
    render(<DocumentUploadField label="Insurance" onFile={onFile} />);

    const input = screen.getByLabelText('Upload Insurance');
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('does not call onFile when no file selected', () => {
    const onFile = vi.fn();
    render(<DocumentUploadField label="Insurance" onFile={onFile} />);

    const input = screen.getByLabelText('Upload Insurance');
    fireEvent.change(input, { target: { files: [] } });

    expect(onFile).not.toHaveBeenCalled();
  });

  it('shows spinner and "Uploading…" text when isUploading is true', () => {
    render(<DocumentUploadField label="Insurance" isUploading onFile={vi.fn()} />);
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
  });

  it('disables the button when isUploading is true', () => {
    render(<DocumentUploadField label="Insurance" isUploading onFile={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows error message when error is provided', () => {
    render(<DocumentUploadField label="Insurance" error="Upload failed" onFile={vi.fn()} />);
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('does not show error message when error is null', () => {
    render(<DocumentUploadField label="Insurance" error={null} onFile={vi.fn()} />);
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
  });
});
