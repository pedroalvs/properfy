import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { PortalReportProblemSection } from './PortalReportProblemSection';

const mutateAsync = vi.fn();
const usePortalIssues = vi.fn();
const useCreatePortalReport = vi.fn();
const uploadPortalIssuePhoto = vi.fn();

vi.mock('../hooks/usePortalIssues', () => ({
  usePortalIssues: (...args: unknown[]) => usePortalIssues(...args),
  useCreatePortalReport: (...args: unknown[]) => useCreatePortalReport(...args),
  uploadPortalIssuePhoto: (...args: unknown[]) => uploadPortalIssuePhoto(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  usePortalIssues.mockReturnValue({ data: { issues: [] }, isLoading: false });
  useCreatePortalReport.mockReturnValue({ mutateAsync, isPending: false });
  mutateAsync.mockResolvedValue({});
  uploadPortalIssuePhoto.mockResolvedValue('file-1');
});

function photoFile(name = 'leak.jpg') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

describe('PortalReportProblemSection', () => {
  it('submits a reason-only report with a stable idempotency key', async () => {
    render(<PortalReportProblemSection token="t" disabled={false} />);
    fireEvent.change(screen.getByLabelText('Describe the issue'), {
      target: { value: 'The gate will not lock' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'The gate will not lock',
        photoFileIds: [],
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByText(/your report has been sent/i)).toBeInTheDocument();
  });

  it('uploads a photo one at a time and includes its fileId on submit', async () => {
    render(<PortalReportProblemSection token="t" disabled={false} />);
    fireEvent.change(screen.getByLabelText('Describe the issue'), { target: { value: 'leak' } });
    fireEvent.change(screen.getByLabelText('Add photos'), {
      target: { files: [photoFile()] },
    });

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(uploadPortalIssuePhoto).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'leak', photoFileIds: ['file-1'] }),
    );
  });

  it('keeps already-confirmed photos when one fails, and shows a clear error (D12)', async () => {
    uploadPortalIssuePhoto
      .mockResolvedValueOnce('file-ok')
      .mockRejectedValueOnce(new ApiError(503, 'unused'));
    render(<PortalReportProblemSection token="t" disabled={false} />);
    fireEvent.change(screen.getByLabelText('Describe the issue'), { target: { value: 'leak' } });
    fireEvent.change(screen.getByLabelText('Add photos'), {
      target: { files: [photoFile('a.jpg'), photoFile('b.jpg')] },
    });

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(await screen.findByText(FILE_STORAGE_UNAVAILABLE_MESSAGE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // Only the confirmed photo is submitted; the failed one is excluded.
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ photoFileIds: ['file-ok'] }),
    );
  });

  it('hides the form for a read-only token but still shows the submitted reports', () => {
    usePortalIssues.mockReturnValue({
      data: {
        issues: [
          { id: 'i1', reason: 'Past report', createdAt: '2026-11-07T00:00:00Z', photos: [] },
        ],
      },
      isLoading: false,
    });
    render(<PortalReportProblemSection token="t" disabled />);
    expect(screen.queryByLabelText('Describe the issue')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
    expect(screen.getByText('Past report')).toBeInTheDocument();
  });

  it('renders the photo count on a submitted report', () => {
    usePortalIssues.mockReturnValue({
      data: {
        issues: [
          {
            id: 'i1',
            reason: 'Leak',
            createdAt: '2026-11-07T00:00:00Z',
            photos: [
              { id: 'p1', fileName: 'a.jpg', mime: 'image/jpeg', status: 'READY', createdAt: '2026-11-07T00:00:00Z' },
              { id: 'p2', fileName: 'b.jpg', mime: 'image/jpeg', status: 'READY', createdAt: '2026-11-07T00:00:00Z' },
            ],
          },
        ],
      },
      isLoading: false,
    });
    render(<PortalReportProblemSection token="t" disabled={false} />);
    expect(screen.getByText('2 photos attached')).toBeInTheDocument();
  });
});
