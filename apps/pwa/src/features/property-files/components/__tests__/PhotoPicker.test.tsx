import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoPicker } from '../PhotoPicker';
import { MAX_ISSUE_PHOTOS } from '../../lib/issue-photo-validation';
import type { LocalPhoto } from '../../hooks/useIssuePhotoUpload';

function photo(over: Partial<LocalPhoto> = {}): LocalPhoto {
  return {
    localId: over.localId ?? 'l1',
    file: new File([new Uint8Array([1])], over.file?.name ?? 'a.jpg', { type: 'image/jpeg' }),
    previewUrl: null,
    status: 'uploading',
    fileId: null,
    error: null,
    ...over,
  };
}

const noop = () => {};

describe('PhotoPicker', () => {
  it('shows an add button and a row per photo with its status', () => {
    render(
      <PhotoPicker
        photos={[
          photo({ localId: 'a', status: 'uploading' }),
          photo({ localId: 'b', status: 'confirmed', fileId: 'f1' }),
          photo({ localId: 'c', status: 'failed', error: 'boom' }),
        ]}
        addError={null}
        onAddFile={noop}
        onRetry={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByTestId('add-photo-button')).toBeEnabled();
    expect(screen.getByTestId('photo-row-a')).toHaveAttribute('data-status', 'uploading');
    expect(screen.getByTestId('photo-row-b')).toHaveAttribute('data-status', 'confirmed');
    expect(screen.getByTestId('photo-row-c')).toHaveAttribute('data-status', 'failed');
    expect(screen.getByTestId('photo-retry-c')).toBeInTheDocument();
    expect(screen.getByTestId('photo-failed-hint')).toBeInTheDocument();
  });

  it('calls onRetry and onRemove', async () => {
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoPicker
        photos={[photo({ localId: 'c', status: 'failed', error: 'boom' })]}
        addError={null}
        onAddFile={noop}
        onRetry={onRetry}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByTestId('photo-retry-c'));
    await user.click(screen.getByTestId('photo-remove-c'));
    expect(onRetry).toHaveBeenCalledWith('c');
    expect(onRemove).toHaveBeenCalledWith('c');
  });

  it('shows the add error and disables the add button at the cap', () => {
    const atCap = Array.from({ length: MAX_ISSUE_PHOTOS }, (_, i) =>
      photo({ localId: `l${i}`, status: 'confirmed', fileId: `f${i}` }),
    );
    render(
      <PhotoPicker photos={atCap} addError="You can add up to 10 photos." onAddFile={noop} onRetry={noop} onRemove={noop} />,
    );
    expect(screen.getByTestId('add-photo-button')).toBeDisabled();
    expect(screen.getByTestId('photo-add-error')).toHaveTextContent('up to 10 photos');
  });

  it('disables the add button when the picker is disabled (offline)', () => {
    render(<PhotoPicker photos={[]} addError={null} onAddFile={noop} onRetry={noop} onRemove={noop} disabled />);
    expect(screen.getByTestId('add-photo-button')).toBeDisabled();
  });
});
