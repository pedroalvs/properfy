import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const create = vi.fn();
const uploadOne = vi.fn();
vi.mock('../hooks/useCreatePropertyIssue', () => ({
  useCreatePropertyIssue: () => ({ create, isCreating: false }),
}));
vi.mock('../hooks/usePropertyFileUpload', () => ({
  usePropertyFileUpload: () => ({ upload: vi.fn(), uploadOne, isUploading: false, uploadError: null }),
}));

import { CreateIssueDrawer } from './CreateIssueDrawer';

beforeEach(() => {
  create.mockReset().mockResolvedValue(true);
  uploadOne.mockReset();
});

describe('CreateIssueDrawer', () => {
  it('disables submit until a reason is entered', () => {
    render(<CreateIssueDrawer open onClose={vi.fn()} propertyId="p1" />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Describe the problem'), {
      target: { value: 'Broken window' },
    });
    expect(submit).toBeEnabled();
  });

  it('creates the issue with the trimmed reason and no photos', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <CreateIssueDrawer open onClose={onClose} propertyId="p1" appointmentId="a1" onCreated={onCreated} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Describe the problem'), {
      target: { value: '  Broken window  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        propertyId: 'p1',
        appointmentId: 'a1',
        reason: 'Broken window',
        photoFileIds: [],
      }),
    );
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
