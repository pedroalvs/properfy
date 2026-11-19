import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyFileType } from '@properfy/shared';

const upload = vi.fn();
vi.mock('../hooks/usePropertyFileUpload', () => ({
  usePropertyFileUpload: () => ({ upload, uploadOne: vi.fn(), isUploading: false, uploadError: null }),
}));

import { UploadFileControl } from './UploadFileControl';

beforeEach(() => upload.mockReset());

describe('UploadFileControl', () => {
  it('uploads the chosen file with the given type/scope and calls onUploaded', async () => {
    upload.mockResolvedValue(true);
    const onUploaded = vi.fn();
    render(
      <UploadFileControl
        type={PropertyFileType.DOCUMENT}
        propertyId="p1"
        appointmentId="a1"
        accept="application/pdf"
        onUploaded={onUploaded}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('application/pdf');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() =>
      expect(upload).toHaveBeenCalledWith({
        file,
        type: PropertyFileType.DOCUMENT,
        propertyId: 'p1',
        appointmentId: 'a1',
      }),
    );
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  it('exposes a labelled trigger button', () => {
    render(
      <UploadFileControl type={PropertyFileType.REPORT} propertyId="p1" accept="application/pdf" label="Upload report" />,
    );
    expect(screen.getByRole('button', { name: 'Upload report' })).toBeInTheDocument();
  });
});
