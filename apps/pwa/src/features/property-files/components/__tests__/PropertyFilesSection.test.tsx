import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyFileType, PropertyIssueSource, type PropertyFileResponse, type PropertyIssueResponse } from '@properfy/shared';
import { PropertyFilesSection } from '../PropertyFilesSection';

let filesState: { grouped: { documents: PropertyFileResponse[]; reports: PropertyFileResponse[]; other: PropertyFileResponse[] }; isLoading: boolean; isError: boolean; refetch: () => void };
let issuesState: { issues: PropertyIssueResponse[]; isLoading: boolean; isError: boolean; refetch: () => void };
let online = true;

vi.mock('../../hooks/usePropertyFiles', () => ({
  usePropertyFiles: () => filesState,
  propertyFilesKey: (id: string) => ['inspector', 'property-files', id],
}));
vi.mock('../../hooks/usePropertyIssues', () => ({
  usePropertyIssues: () => issuesState,
  propertyIssuesKey: (id: string) => ['inspector', 'property-issues', id],
}));
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => online }));
vi.mock('@/hooks/useEffectiveTimezone', () => ({ useEffectiveTimezone: () => 'Australia/Sydney' }));
// Isolate the section from the report-issue flow (its own suite covers it).
vi.mock('../ReportIssueSheet', () => ({ ReportIssueSheet: () => null }));

function docFile(id: string): PropertyFileResponse {
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
  };
}

function issue(id: string): PropertyIssueResponse {
  return {
    id,
    propertyId: 'p1',
    appointmentId: 'apt-1',
    reason: 'Broken window',
    source: PropertyIssueSource.STAFF,
    createdByUserId: null,
    cantDoEventId: null,
    seenAt: null,
    seenByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    photos: [],
  };
}

function renderSection() {
  return render(<PropertyFilesSection appointmentId="apt-1" propertyId="p1" propertyAddress="123 Main St" />);
}

describe('PropertyFilesSection', () => {
  beforeEach(() => {
    online = true;
    filesState = { grouped: { documents: [docFile('d1')], reports: [], other: [] }, isLoading: false, isError: false, refetch: vi.fn() };
    issuesState = { issues: [issue('i1'), issue('i2')], isLoading: false, isError: false, refetch: vi.fn() };
  });

  it('defaults to the Issues subtab, shows per-type counts and the total', () => {
    renderSection();
    expect(screen.getByRole('tab', { name: 'Issues (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Documents (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reports (0)' })).toBeInTheDocument();
    expect(screen.getByText('Files (3)')).toBeInTheDocument();
    expect(screen.getByTestId('issue-card-i1')).toBeInTheDocument();
  });

  it('switches to the Documents subtab', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('tab', { name: 'Documents (1)' }));
    expect(screen.getByTestId('file-row-d1')).toBeInTheDocument();
    expect(screen.queryByTestId('issue-card-i1')).not.toBeInTheDocument();
  });

  it('shows an offline message instead of files when offline', () => {
    online = false;
    renderSection();
    expect(screen.getByTestId('property-files-offline')).toBeInTheDocument();
    expect(screen.queryByTestId('issue-card-i1')).not.toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    issuesState = { ...issuesState, isError: true };
    renderSection();
    expect(screen.getByText('Failed to load files')).toBeInTheDocument();
  });

  it('does not render file cards while loading', () => {
    filesState = { grouped: { documents: [], reports: [], other: [] }, isLoading: true, isError: false, refetch: vi.fn() };
    issuesState = { issues: [], isLoading: true, isError: false, refetch: vi.fn() };
    renderSection();
    expect(screen.queryByText('No issues reported')).not.toBeInTheDocument();
    expect(screen.getByText('Files (0)')).toBeInTheDocument();
  });
});
