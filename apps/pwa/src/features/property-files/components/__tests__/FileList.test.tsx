import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyFileType, type PropertyFileResponse } from '@properfy/shared';
import { FileList } from '../FileList';

const mockOpenFile = vi.fn();
vi.mock('../../hooks/useFileDownload', () => ({
  useFileDownload: () => ({ openFile: mockOpenFile, pendingId: null, error: null }),
}));

function file(id: string, over: Partial<PropertyFileResponse> = {}): PropertyFileResponse {
  return {
    id,
    propertyId: 'p1',
    appointmentId: 'apt-1',
    issueId: null,
    type: PropertyFileType.DOCUMENT,
    versionGroupId: 'vg',
    version: 1,
    fileName: `${id}.pdf`,
    mime: 'application/pdf',
    sizeBytes: 10,
    status: 'READY',
    uploadedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

describe('FileList', () => {
  beforeEach(() => mockOpenFile.mockReset());

  it('renders a row per file and opens it on tap', async () => {
    const user = userEvent.setup();
    render(<FileList files={[file('d1', { fileName: 'lease.pdf' })]} emptyLabel="No documents" />);
    expect(screen.getByTestId('file-row-d1')).toHaveTextContent('lease.pdf');
    await user.click(screen.getByTestId('file-row-d1'));
    expect(mockOpenFile).toHaveBeenCalledWith('d1');
  });

  it('shows the empty label when there are no files', () => {
    render(<FileList files={[]} emptyLabel="No documents" />);
    expect(screen.getByText('No documents')).toBeInTheDocument();
  });
});
