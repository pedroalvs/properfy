import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { mockShowError, mockUploadLogo, mockRemoveLogo } = vi.hoisted(() => ({
  mockShowError: vi.fn(),
  mockUploadLogo: vi.fn(),
  mockRemoveLogo: vi.fn(),
}));

vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      messages: [],
      showError: mockShowError,
      showInfo: vi.fn(),
      showSuccess: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

vi.mock('../hooks/useTenantLogo', () => ({
  useTenantLogo: () => ({
    uploadLogo: mockUploadLogo,
    removeLogo: mockRemoveLogo,
    isUploading: false,
    isRemoving: false,
  }),
}));

import { EmailLogoSection } from './EmailLogoSection';

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const LOGO_URL = 'https://cdn.example.com/tenant-branding/tenants/t1/branding/logo.png';

// jsdom has no createObjectURL.
const createObjectURL = vi.fn(() => 'blob:preview-url');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function selectFile(file: File) {
  const input = screen.getByTestId('logo-file-input');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('EmailLogoSection', () => {
  it('shows the empty state and no Remove button without a logo', () => {
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={null} onChanged={vi.fn()} />);
    expect(screen.getByText('No logo uploaded yet.')).toBeInTheDocument();
    expect(screen.getByText('Choose image')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('shows the current logo image and Replace/Remove actions', () => {
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={LOGO_URL} onChanged={vi.fn()} />);
    expect(screen.getByAltText('Current agency logo')).toHaveAttribute('src', LOGO_URL);
    expect(screen.getByText('Replace logo')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('previews a selected file via object URL and uploads it', async () => {
    const onChanged = vi.fn();
    mockUploadLogo.mockResolvedValue(true);
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={null} onChanged={onChanged} />);

    const file = new File(['png'], 'brand.png', { type: 'image/png' });
    selectFile(file);

    expect(await screen.findByAltText('Selected logo preview')).toHaveAttribute(
      'src',
      'blob:preview-url',
    );
    expect(screen.getByText('brand.png')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => {
      expect(mockUploadLogo).toHaveBeenCalledWith(file);
    });
    expect(onChanged).toHaveBeenCalled();
    // Selection cleared → back to picker state.
    expect(screen.getByText('Choose image')).toBeInTheDocument();
  });

  it('rejects a non-image type client-side without calling the API', () => {
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={null} onChanged={vi.fn()} />);
    selectFile(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(mockShowError).toHaveBeenCalledWith('Logo must be a PNG, JPEG or WebP image');
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  it('rejects an oversized file client-side', () => {
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={null} onChanged={vi.fn()} />);
    const big = new File([''], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    selectFile(big);
    expect(mockShowError).toHaveBeenCalledWith('Logo must be 2 MB or smaller');
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  it('cancelling a selection returns to the current logo view', async () => {
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={LOGO_URL} onChanged={vi.fn()} />);
    selectFile(new File(['png'], 'brand.png', { type: 'image/png' }));
    expect(await screen.findByAltText('Selected logo preview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByAltText('Current agency logo')).toBeInTheDocument();
    expect(mockUploadLogo).not.toHaveBeenCalled();
  });

  it('removes the logo behind a confirmation dialog', async () => {
    const onChanged = vi.fn();
    mockRemoveLogo.mockResolvedValue(true);
    render(<EmailLogoSection tenantId={TENANT_ID} logoUrl={LOGO_URL} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByText('Remove Logo')).toBeInTheDocument();
    expect(mockRemoveLogo).not.toHaveBeenCalled();

    // Dialog confirm button shares the "Remove" label with the trigger.
    const buttons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => {
      expect(mockRemoveLogo).toHaveBeenCalled();
    });
    expect(onChanged).toHaveBeenCalled();
  });
});
