import type { Page } from '@playwright/test';

export const AM_USER = {
  id: 'user-am-1',
  name: 'Admin Master',
  email: 'admin@properfy.com',
  role: 'AM',
  tenantId: 'tenant-1',
};

export const TENANT_1 = { id: 'tenant-1', name: 'Acme Realty' };
export const BRANCH_1 = { id: 'branch-1', name: 'Brunswick Office', tenantId: 'tenant-1' };

export function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apt-1',
    appointmentNumber: 1001,
    code: 'APT-1001',
    tenantId: 'tenant-1',
    tenantName: 'Acme Realty',
    branchId: 'branch-1',
    branchName: 'Brunswick Office',
    propertyId: 'prop-1',
    propertyAddress: '123 Test Street, Brunswick VIC 3056',
    serviceTypeId: 'st-1',
    serviceTypeName: 'Routine Inspection',
    status: 'SCHEDULED',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    contactName: 'John Doe',
    contactPhone: '0400000000',
    contactEmail: 'john@test.com',
    inspectorId: 'insp-1',
    inspectorName: 'Inspector Smith',
    scheduledDate: '2026-04-20',
    timeSlot: '09:00-12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    cancellationReason: null,
    notes: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    isOverdue: false,
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    contacts: [
      {
        id: 'ac-1',
        contactId: 'c-1',
        role: 'RENTAL_TENANT',
        isPrimary: true,
        snapshotName: 'John Doe',
        snapshotEmail: 'john@test.com',
        snapshotPhone: '0400000000',
      },
    ],
    restrictions: [],
    ...overrides,
  };
}

export async function setupAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh');
  });
}

export async function mockMeEndpoint(page: Page, user = AM_USER) {
  await page.route('**/v1/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

export async function mockAppointmentList(
  page: Page,
  appointments: Record<string, unknown>[] = [],
) {
  await page.route('**/v1/appointments?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: appointments,
        pagination: {
          page: 1,
          pageSize: 20,
          total: appointments.length,
          totalPages: 1,
        },
      }),
    });
  });
}

export async function mockAppointmentDetail(
  page: Page,
  appointment: Record<string, unknown>,
) {
  await page.route('**/v1/appointments/*', async (route) => {
    const url = route.request().url();
    if (url.includes('status-transitions') || url.includes('bulk-edit')) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: appointment }),
    });
  });
}

export async function mockFormOptions(page: Page) {
  await page.route('**/v1/tenants?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [TENANT_1],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
    });
  });

  await page.route('**/v1/branches?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [BRANCH_1],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
    });
  });

  await page.route('**/v1/service-types?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'st-1', name: 'Routine Inspection' }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
    });
  });

  await page.route('**/v1/inspectors?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'insp-1', name: 'Inspector Smith' }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
    });
  });
}
