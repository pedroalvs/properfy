import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PropertyFileResponse, PropertyIssueResponse } from '@properfy/shared';

const filesState = {
  files: [] as PropertyFileResponse[],
  counts: { total: 0, issues: 0, documents: 0, reports: 0, other: 0 },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
const issuesState = {
  issues: [] as PropertyIssueResponse[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock('../hooks/usePropertyFiles', () => ({ usePropertyFiles: () => filesState }));
vi.mock('../hooks/usePropertyIssues', () => ({ usePropertyIssues: () => issuesState }));
vi.mock('@/features/properties/hooks/usePropertyAppointments', () => ({
  usePropertyAppointments: () => ({ data: [], isLoading: false, isError: false, errorMessage: null, refetch: vi.fn(), pagination: {} }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canPerform: () => true }) }));
// Stub the subtab bodies — this test is about the panel's tab composition + counts.
vi.mock('./IssueSubtab', () => ({ IssueSubtab: () => <div data-testid="issue-subtab" /> }));
vi.mock('./FileSubtabList', () => ({ FileSubtabList: ({ type }: { type: string }) => <div data-testid="file-subtab">{type}</div> }));

import { PropertyFilesPanel } from './PropertyFilesPanel';

function fileRow(group: string, version: number, type: PropertyFileResponse['type']): PropertyFileResponse {
  return {
    id: `${group}-${version}`,
    propertyId: 'p1',
    appointmentId: null,
    issueId: null,
    type,
    versionGroupId: group,
    version,
    fileName: `${group}.pdf`,
    mime: 'application/pdf',
    sizeBytes: 1,
    status: 'READY' as PropertyFileResponse['status'],
    uploadedByUserId: null,
    createdAt: '2026-11-07T00:00:00Z',
  };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <PropertyFilesPanel context={{ kind: 'property', propertyId: 'p1' }} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  filesState.files = [];
  filesState.isLoading = false;
  filesState.isError = false;
  issuesState.issues = [];
  issuesState.isLoading = false;
  issuesState.isError = false;
});

describe('PropertyFilesPanel', () => {
  it('counts issues and version-grouped files per subtab', () => {
    issuesState.issues = [{ id: 'i1' } as PropertyIssueResponse, { id: 'i2' } as PropertyIssueResponse];
    filesState.files = [
      fileRow('A', 1, 'DOCUMENT'),
      fileRow('A', 2, 'DOCUMENT'), // same group → 1 document
      fileRow('R', 1, 'REPORT'),
    ];
    renderPanel();
    expect(screen.getByRole('tab', { name: /Issues/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Documents/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Reports/ })).toHaveTextContent('1');
  });

  it('opens on the Issues subtab and switches to a file subtab', () => {
    renderPanel();
    expect(screen.getByTestId('issue-subtab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Documents/ }));
    expect(screen.getByTestId('file-subtab')).toHaveTextContent('DOCUMENT');
  });

  it('shows a loading state while data loads', () => {
    filesState.isLoading = true;
    renderPanel();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    issuesState.isError = true;
    renderPanel();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
