import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

// The SnackbarProvider holds state but a separate container renders the DOM, so
// we spy on showSuccess rather than asserting toast markup.
const showSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError: vi.fn(), showInfo: vi.fn(), dismiss: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { api } from '@/services/api';
import { NewInspectorNoticeDrawer } from './NewInspectorNoticeDrawer';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

// Real UUIDs — the publish schema requires uuid for inspector/region ids.
const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const REGION = '33333333-3333-4333-8333-333333333333';

interface GetConfig {
  allTotal?: number;
  allCountFails?: boolean;
}

function installGet(cfg: GetConfig = {}) {
  const inspectors = [
    { id: ANA, name: 'Ana', email: 'a@x.io' },
    { id: BOB, name: 'Bob', email: 'b@x.io' },
  ];
  const regions = [{ id: REGION, name: 'North Shore', inspectorCount: 8 }];
  mockGet.mockImplementation((path: string, init: { params: { query: Record<string, string> } }) => {
    const q = init?.params?.query ?? {};
    if (path === '/v1/inspectors' && q.pageSize === '1') {
      if (cfg.allCountFails) return Promise.resolve({ error: { error: { code: 'X', message: 'x' } }, response: { status: 500 } });
      const total = cfg.allTotal ?? 42;
      return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 1, total, totalPages: total } } });
    }
    if (path === '/v1/inspectors') {
      return Promise.resolve({ data: { data: inspectors, pagination: { page: 1, pageSize: 100, total: inspectors.length, totalPages: 1 } } });
    }
    if (path === '/v1/service-regions') {
      return Promise.resolve({ data: { data: regions, pagination: { page: 1, pageSize: 100, total: regions.length, totalPages: 1 } } });
    }
    return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
  });
}

function renderDrawer(onClose = vi.fn(), onPublished = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <NewInspectorNoticeDrawer open onClose={onClose} onPublished={onPublished} />
        </SnackbarProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, onClose, onPublished, invalidate };
}

function fill(title = 'Road closure', body = 'Pacific Hwy closed') {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: body } });
}

function clickFormPublish() {
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
}

async function confirmPublish() {
  const dialog = await screen.findByRole('dialog', { name: 'Publish notice?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  showSuccess.mockClear();
  installGet();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NewInspectorNoticeDrawer', () => {
  it('shows required-field errors and sends no POST on an empty publish', async () => {
    renderDrawer();
    clickFormPublish();
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Message is required')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('enforces the title length limit with a counter in error', async () => {
    renderDrawer();
    fill('a'.repeat(121), 'ok body');
    clickFormPublish();
    expect(await screen.findByText('Title must be 120 characters or fewer')).toBeInTheDocument();
    expect(screen.getByText('121/120')).toBeInTheDocument();
  });

  it('updates the character counters as you type', async () => {
    renderDrawer();
    fill('Road closure', 'Pacific Hwy closed and detoured today');
    expect(screen.getByText('12/120')).toBeInTheDocument();
    expect(screen.getByText('37/2000')).toBeInTheDocument();
  });

  it('requires at least one inspector for the Selected audience', async () => {
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Selected inspectors' }));
    clickFormPublish();
    expect(await screen.findByText('Select at least one inspector')).toBeInTheDocument();
  });

  it('requires a region for the Region audience', async () => {
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Region' }));
    clickFormPublish();
    expect(await screen.findByText('Select a region')).toBeInTheDocument();
  });

  it('non-critical confirm shows only the base copy', async () => {
    renderDrawer();
    fill();
    clickFormPublish();
    const dialog = await screen.findByRole('dialog', { name: 'Publish notice?' });
    expect(within(dialog).getByText('Publish notice?')).toBeInTheDocument();
    expect(
      within(dialog).getByText("Notices can't be edited or deleted after publishing. You can archive them later."),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('receive an SMS');
  });

  it('critical ALL confirm shows the SMS ceiling from the active count', async () => {
    installGet({ allTotal: 42 });
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    clickFormPublish();
    expect(await screen.findByText('Up to 42 inspectors may receive an SMS.')).toBeInTheDocument();
  });

  it('critical ALL with a failed count uses the no-number fallback and still publishes', async () => {
    installGet({ allCountFails: true });
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    clickFormPublish();
    expect(await screen.findByText('Inspectors without push may receive an SMS.')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Publish notice?' });
    expect(within(dialog).getByRole('button', { name: 'Publish' })).toBeEnabled();
  });

  it('critical SELECTED confirm uses the selection size (singular)', async () => {
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Selected inspectors' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
    clickFormPublish();
    expect(await screen.findByText('Up to 1 inspector may receive an SMS.')).toBeInTheDocument();
  });

  it('critical REGION confirm uses the region inspectorCount', async () => {
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Region' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    fireEvent.click(await screen.findByText('Choose a region'));
    fireEvent.click(await screen.findByText('North Shore (8 inspectors)'));
    clickFormPublish();
    expect(await screen.findByText('Up to 8 inspectors may receive an SMS.')).toBeInTheDocument();
  });

  it('shows the night-time phrase at 22:40 Sydney', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T11:40:00Z')); // 22:40 Sydney
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    clickFormPublish();
    expect(await screen.findByText("It's 10:40 pm in Sydney. Inspectors will be notified now.")).toBeInTheDocument();
  });

  it('shows no time phrase in the Sydney daytime', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T23:00:00Z')); // 10:00 am Sydney
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark as critical/ }));
    clickFormPublish();
    const dialog = await screen.findByRole('dialog', { name: 'Publish notice?' });
    expect(dialog.textContent).not.toContain('in Sydney');
  });

  it('links the lock-screen hint to the Message field via aria-describedby', () => {
    renderDrawer();
    const message = screen.getByLabelText('Message');
    expect(message.getAttribute('aria-describedby') ?? '').toContain('notice-body-lock');
    expect(screen.getByText("Shown on the lock screen. Don't include keys, codes or tenant details.")).toHaveAttribute(
      'id',
      'notice-body-lock',
    );
  });

  it('publishes with the payload and an Idempotency-Key header, then shows a snackbar and closes', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'n1', recipientCount: 12 } } });
    const { onClose, onPublished, invalidate } = renderDrawer();
    fill();
    clickFormPublish();
    await confirmPublish();
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-notices', {
      body: { title: 'Road closure', body: 'Pacific Hwy closed', critical: false, audience: { type: 'ALL' } },
      headers: { 'Idempotency-Key': expect.any(String) },
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Notice published to 12 inspectors'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPublished).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inspector-notices'] });
  });

  it('reuses the same Idempotency-Key when a failed publish is retried', async () => {
    mockPost.mockRejectedValueOnce(new TypeError('offline'));
    renderDrawer();
    fill();
    clickFormPublish();
    await confirmPublish();
    await screen.findByText("You're offline. Check your connection and try again.");

    mockPost.mockResolvedValueOnce({ data: { data: { id: 'n1', recipientCount: 1 } } });
    clickFormPublish();
    await confirmPublish();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0]![1].headers['Idempotency-Key']).toBe(mockPost.mock.calls[1]![1].headers['Idempotency-Key']);
  });

  it('maps 422 NO_RECIPIENTS to a banner', async () => {
    mockPost.mockResolvedValue({ error: { error: { code: 'INSPECTOR_NOTICE_NO_RECIPIENTS', message: 'x' } }, response: { status: 422 } });
    renderDrawer();
    fill();
    clickFormPublish();
    await confirmPublish();
    expect(await screen.findByText('No active inspectors match this audience.')).toBeInTheDocument();
  });

  it('maps 400 INVALID_RECIPIENTS and unchecks the invalid inspectors', async () => {
    mockPost.mockResolvedValue({
      error: { error: { code: 'INSPECTOR_NOTICE_INVALID_RECIPIENTS', message: 'x', details: { inspectorIds: [ANA] } } },
      response: { status: 400 },
    });
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Selected inspectors' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Bob/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    clickFormPublish();
    await confirmPublish();
    expect(await screen.findByText('Some selected inspectors are no longer active. Review the selection.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
  });

  it('maps 422 REGION_INACTIVE to a banner', async () => {
    mockPost.mockResolvedValue({ error: { error: { code: 'INSPECTOR_NOTICE_REGION_INACTIVE', message: 'x' } }, response: { status: 422 } });
    renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Region' }));
    fireEvent.click(await screen.findByText('Choose a region'));
    fireEvent.click(await screen.findByText('North Shore (8 inspectors)'));
    clickFormPublish();
    await confirmPublish();
    expect(await screen.findByText('This region is inactive. Choose another region.')).toBeInTheDocument();
  });

  it('confirms before discarding a dirty form', async () => {
    const { onClose } = renderDrawer();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard this notice?' });
    expect(within(dialog).getByText('Discard this notice?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
});
