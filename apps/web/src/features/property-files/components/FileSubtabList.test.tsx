import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyFileType, type PropertyFileResponse } from '@properfy/shared';

vi.mock('../hooks/useDownloadPropertyFile', () => ({
  useDownloadPropertyFile: () => ({ download: vi.fn(), downloadingId: null }),
}));
vi.mock('../hooks/useAddFileVersion', () => ({
  useAddFileVersion: () => ({ addVersion: vi.fn(), isUploading: false }),
}));
vi.mock('../hooks/useDeletePropertyFile', () => ({
  useDeletePropertyFile: () => ({ remove: vi.fn(), isDeleting: false, deletingId: undefined }),
}));
vi.mock('../hooks/usePropertyFileUpload', () => ({
  usePropertyFileUpload: () => ({ upload: vi.fn(), uploadOne: vi.fn(), isUploading: false, uploadError: null }),
}));

import { FileSubtabList } from './FileSubtabList';

function file(id: string, group: string, version: number, name: string): PropertyFileResponse {
  return {
    id,
    propertyId: 'p1',
    appointmentId: null,
    issueId: null,
    type: 'DOCUMENT' as PropertyFileResponse['type'],
    versionGroupId: group,
    version,
    fileName: name,
    mime: 'application/pdf',
    sizeBytes: 100,
    status: 'READY' as PropertyFileResponse['status'],
    uploadedByUserId: null,
    createdAt: '2026-11-07T00:00:00Z',
  };
}

const FILES = [
  file('a1', 'A', 1, 'report-v1.pdf'),
  file('a2', 'A', 2, 'report-v2.pdf'),
  file('b1', 'B', 1, 'other.pdf'),
];

function renderList(overrides: Partial<React.ComponentProps<typeof FileSubtabList>> = {}) {
  return render(
    <FileSubtabList
      files={FILES}
      type={PropertyFileType.DOCUMENT}
      propertyId="p1"
      canUpload={false}
      canVersion={false}
      canDelete={false}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FileSubtabList', () => {
  it('shows one card per version group (latest version)', () => {
    renderList();
    // latest of group A is v2; v1 is not shown as its own card
    expect(screen.getByText('report-v2.pdf')).toBeInTheDocument();
    expect(screen.queryByText('report-v1.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('other.pdf')).toBeInTheDocument();
  });

  it('filters by name in the active subtab', async () => {
    renderList();
    // FilterInput is debounced (300ms), so the filter applies asynchronously.
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'other' } });
    await vi.waitFor(() => expect(screen.queryByText('report-v2.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('other.pdf')).toBeInTheDocument();
  });

  it('hides upload/version/delete controls for a read-only viewer', () => {
    renderList({ canUpload: false, canVersion: false, canDelete: false });
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('shows the controls for an authorized viewer', () => {
    renderList({ canUpload: true, canVersion: true, canDelete: true });
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New version of/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Delete/ }).length).toBeGreaterThan(0);
  });
});
