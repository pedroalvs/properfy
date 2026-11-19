import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyFileType, PropertyIssueSource, type PropertyFileResponse, type PropertyIssueResponse } from '@properfy/shared';
import { IssueCard } from '../IssueCard';

const mockOpenFile = vi.fn();
vi.mock('../../hooks/useFileDownload', () => ({
  useFileDownload: () => ({ openFile: mockOpenFile, pendingId: null, error: null }),
}));
vi.mock('@/hooks/useEffectiveTimezone', () => ({ useEffectiveTimezone: () => 'Australia/Sydney' }));

function photo(id: string): PropertyFileResponse {
  return {
    id,
    propertyId: 'p1',
    appointmentId: 'apt-1',
    issueId: 'i1',
    type: PropertyFileType.ISSUE,
    versionGroupId: 'vg',
    version: 1,
    fileName: `${id}.jpg`,
    mime: 'image/jpeg',
    sizeBytes: 10,
    status: 'READY',
    uploadedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

function issue(over: Partial<PropertyIssueResponse> = {}): PropertyIssueResponse {
  return {
    id: 'i1',
    propertyId: 'p1',
    appointmentId: 'apt-1',
    reason: 'Broken window in the bedroom',
    source: PropertyIssueSource.STAFF,
    createdByUserId: null,
    cantDoEventId: null,
    seenAt: null,
    seenByUserId: null,
    createdAt: '2026-11-03T04:00:00.000Z',
    photos: [],
    ...over,
  };
}

describe('IssueCard', () => {
  beforeEach(() => mockOpenFile.mockReset());

  it('shows the origin badge, reason and photo tiles (no author)', async () => {
    const user = userEvent.setup();
    render(<IssueCard issue={issue({ source: PropertyIssueSource.INSPECTOR, photos: [photo('ph1'), photo('ph2')] })} />);

    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Broken window in the bedroom')).toBeInTheDocument();
    expect(screen.getByTestId('issue-photo-ph1')).toHaveTextContent('Photo 1');
    expect(screen.getByTestId('issue-photo-ph2')).toHaveTextContent('Photo 2');

    await user.click(screen.getByTestId('issue-photo-ph1'));
    expect(mockOpenFile).toHaveBeenCalledWith('ph1');
  });

  it('shows "No photos" for an issue without photos', () => {
    render(<IssueCard issue={issue({ photos: [] })} />);
    expect(screen.getByText('No photos')).toBeInTheDocument();
  });
});
