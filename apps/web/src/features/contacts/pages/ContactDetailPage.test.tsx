import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import type * as UseAuthModule from '@/hooks/useAuth';
type UseAuthExports = typeof UseAuthModule;
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<UseAuthExports>();
  return { ...actual, useAuth: () => mockUseAuth() };
});

import { SnackbarProvider } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { ContactDetailPage } from './ContactDetailPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000099';

const baseContact = {
  id: CONTACT_ID,
  tenantId: TENANT_A,
  type: 'PROPERTY_MANAGER',
  displayName: 'Jane Smith',
  company: null,
  primaryEmail: 'jane@example.com',
  primaryPhone: null,
  additionalChannels: [],
  notes: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function setUser(role: string, tenantId: string | null) {
  mockUseAuth.mockReturnValue({
    user: { id: 'u1', name: 'Test', email: 't@t.com', role, tenantId, branchId: null },
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function createWrapper(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/contacts/:id" element={children} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/v1/contacts/')) {
      return { data: { data: baseContact } };
    }
    return { data: { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } } };
  });
  mockUseAuth.mockReset();
});

function renderPage(role = 'CL_ADMIN') {
  setUser(role, TENANT_A);
  const Wrapper = createWrapper(`/contacts/${CONTACT_ID}`);
  return render(<Wrapper><ContactDetailPage /></Wrapper>);
}

describe('ContactDetailPage — lazy fetch on tab activation (NFR-204)', () => {
  it('initial render does NOT fire any sub-resource query', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0));
    const calls = mockGet.mock.calls.map(([p]) => String(p));
    expect(calls.some((p) => p.includes('includeAppointments=true'))).toBe(false);
    expect(calls.some((p) => p.includes('includeProperties=true'))).toBe(false);
    expect(calls.some((p) => p.startsWith('/v1/audit-logs'))).toBe(false);
  });

  it('activating Relations tab fires the combined includeProperties + includeAppointments query', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: /Relations/i }));
    await waitFor(() => {
      const calls = mockGet.mock.calls.map(([p]) => String(p));
      expect(
        calls.some((p) => p.includes('includeProperties=true') && p.includes('includeAppointments=true')),
      ).toBe(true);
    });
  });

  it('Relations tab renders appointment links that navigate in the same tab', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('includeProperties=true')) {
        return {
          data: {
            data: {
              ...baseContact,
              properties: {
                data: [{
                  propertyId: 'prop-1',
                  propertyCode: 'AG-PROP-0001',
                  street: '1 Test St',
                  suburb: 'Sydney',
                  postcode: '2000',
                  state: 'NSW',
                  appointmentCount: 1,
                  isPrimaryInActiveAppointment: false,
                }],
                pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
              },
              appointments: {
                data: [{
                  appointmentId: 'apt-9',
                  appointmentNumber: 1009,
                  status: 'SCHEDULED',
                  scheduledDate: '2026-08-01',
                  role: 'TENANT',
                  isPrimary: false,
                  propertyId: 'prop-1',
                  propertyCode: 'AG-PROP-0001',
                }],
                pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
              },
            },
          },
        };
      }
      if (typeof path === 'string' && path.startsWith('/v1/contacts/')) {
        return { data: { data: baseContact } };
      }
      return { data: { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } } };
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: /Relations/i }));
    const groupToggle = await screen.findByText('AG-PROP-0001');
    fireEvent.click(groupToggle);
    const link = await screen.findByRole('link', { name: '#1009' });
    expect(link).toHaveAttribute('href', '/appointments/apt-9');
    expect(link).not.toHaveAttribute('target');
  });

  it('activating Timeline tab fires the audit-logs query', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: /Timeline/i }));
    await waitFor(() => {
      const calls = mockGet.mock.calls.map(([p]) => String(p));
      expect(calls.some((p) => p.startsWith('/v1/audit-logs'))).toBe(true);
    });
  });
});

describe('ContactDetailPage — Timeline tab visibility (audit.view RBAC)', () => {
  it('hides the Timeline tab from CL_USER', () => {
    renderPage('CL_USER');
    expect(screen.queryByRole('tab', { name: /Timeline/i })).not.toBeInTheDocument();
  });

  it('shows the Timeline tab to CL_ADMIN', async () => {
    renderPage('CL_ADMIN');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Timeline/i })).toBeInTheDocument();
    });
  });
});
