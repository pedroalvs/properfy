import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploadStep } from './FileUploadStep';

describe('FileUploadStep', () => {
  const defaultProps = {
    onFileSelect: vi.fn(),
    acceptedTypes: ['.csv', '.xlsx'],
    maxSizeMB: 5,
    selectedFile: null,
  };

  it('renders drop zone with instructions', () => {
    render(<FileUploadStep {...defaultProps} />);

    expect(screen.getByText('Drag and drop your file here')).toBeInTheDocument();
    expect(screen.getByText('or click to browse')).toBeInTheDocument();
    expect(screen.getByText('Accepted: CSV, XLSX (max 5MB)')).toBeInTheDocument();
  });

  it('shows selected file info', () => {
    const file = new File(['test content'], 'data.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 2048 });

    render(<FileUploadStep {...defaultProps} selectedFile={file} />);

    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('validates file type', () => {
    const onFileSelect = vi.fn();
    render(<FileUploadStep {...defaultProps} onFileSelect={onFileSelect} />);

    const input = screen.getByTestId('file-input');
    const invalidFile = new File(['test'], 'data.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-upload-error')).toHaveTextContent(
      'Invalid file type',
    );
  });

  it('validates file size', () => {
    const onFileSelect = vi.fn();
    render(
      <FileUploadStep {...defaultProps} onFileSelect={onFileSelect} maxSizeMB={1} />,
    );

    const input = screen.getByTestId('file-input');
    const largeFile = new File(['x'.repeat(100)], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-upload-error')).toHaveTextContent(
      'File is too large',
    );
  });

  it('calls onFileSelect for valid file', () => {
    const onFileSelect = vi.fn();
    render(<FileUploadStep {...defaultProps} onFileSelect={onFileSelect} />);

    const input = screen.getByTestId('file-input');
    const validFile = new File(['a,b,c\n1,2,3'], 'data.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [validFile] } });

    expect(onFileSelect).toHaveBeenCalledWith(validFile);
  });

  it('shows a remove button for the staged file when onRemove is provided', () => {
    const file = new File(['test content'], 'data.csv', { type: 'text/csv' });
    const onRemove = vi.fn();

    render(<FileUploadStep {...defaultProps} selectedFile={file} onRemove={onRemove} />);

    const removeButton = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not show a remove button when onRemove is not provided (e.g. property import)', () => {
    const file = new File(['test content'], 'data.csv', { type: 'text/csv' });

    render(<FileUploadStep {...defaultProps} selectedFile={file} />);

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('does not show a remove button when there is no staged file', () => {
    const onRemove = vi.fn();

    render(<FileUploadStep {...defaultProps} onRemove={onRemove} />);

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
