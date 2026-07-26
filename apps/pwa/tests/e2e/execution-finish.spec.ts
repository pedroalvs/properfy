import { test, expect, type Page } from '@playwright/test';

const APPOINTMENT_ID = 'apt-e2e-finish';

interface SetupOptions {
  scheduledDate: string;
  withInspectionAppLink: boolean;
}

interface SetupResult {
  finishCalls: () => number;
}

async function setupExecutionAtFinishing(
  page: Page,
  { scheduledDate, withInspectionAppLink }: SetupOptions,
): Promise<SetupResult> {
  let finishCallCount = 0;

  await page.addInitScript(() => {
    const position = {
      coords: { latitude: -33.8688, longitude: 151.2093, accuracy: 5 },
      timestamp: Date.now(),
    };
    navigator.geolocation.getCurrentPosition = (success) => {
      setTimeout(() => success(position as GeolocationPosition), 50);
    };
    navigator.geolocation.watchPosition = (success) => {
      setTimeout(() => success(position as GeolocationPosition), 50);
      return 1;
    };
  });

  await page.route('**/v1/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'stub' } }),
    }),
  );

  await page.route('**/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        name: 'E2E Inspector',
        email: 'insp@test.com',
        role: 'INSP',
        tenantId: null,
        inspectorId: 'insp-1',
      }),
    }),
  );

  await page.route(`**/v1/inspector/appointments/${APPOINTMENT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: APPOINTMENT_ID,
          appointmentCode: 'E2E-APT-0001',
          status: 'SCHEDULED',
          scheduledDate,
          timeSlotStart: '09:00',
          timeSlotEnd: '11:00',
          propertyAddress: '123 E2E St, Sydney',
          suburb: 'Sydney',
          rentalTenantConfirmation: 'CONFIRMED',
          serviceTypeName: 'Routine Inspection',
          flowType: 'ROUTINE',
          rentalTenantName: 'Jane Tenant',
          rentalTenantPhone: null,
          rentalTenantEmail: null,
          keyRequired: false,
          meetingLocation: null,
          restrictionsSummary: null,
          propertyLatitude: -33.8688,
          propertyLongitude: 151.2093,
          notes: null,
          observation: null,
          customFields: [],
          restrictions: [],
          apps: [],
          jobDetails: {
            agency: { id: 'ag-1', name: 'E2E Agency' },
            tenantContacts: [],
            keys: { keyRequired: false, keyLocation: null },
            propertyManager: null,
            payment: { payoutAmount: 100, currency: 'AUD' },
            ...(withInspectionAppLink
              ? { inspectionAppLink: { label: 'Inspection App', url: 'https://inspection.example.com' } }
              : {}),
          },
        },
      }),
    }),
  );

  await page.route(`**/v1/inspector/appointments/${APPOINTMENT_ID}/finish`, (route) => {
    finishCallCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { appointmentId: APPOINTMENT_ID, status: 'DONE' } }),
    });
  });

  await page.goto('/login');
  await page.evaluate(async (appointmentId) => {
    localStorage.setItem('access_token', 'e2e-token');
    localStorage.setItem('refresh_token', 'e2e-refresh');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('properfy-pwa', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('execution-states')) db.createObjectStore('execution-states');
        if (!db.objectStoreNames.contains('queued-actions')) db.createObjectStore('queued-actions');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('execution-states', 'readwrite');
        tx.objectStore('execution-states').put(
          {
            appointmentId,
            phase: 'FINISHING',
            pendingSync: false,
            startLocation: {
              latitude: -33.8688,
              longitude: 151.2093,
              accuracy: 5,
              capturedAt: '2026-07-20T09:05:00.000Z',
            },
            finishLocation: null,
            checklistTemplate: [],
            checklistResponses: [],
            notes: '',
            startedAt: '2026-07-20T09:05:00.000Z',
            errorMessage: null,
            lastSavedAt: null,
          },
          appointmentId,
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, APPOINTMENT_ID);

  await page.goto(`/execution/${APPOINTMENT_ID}`);
  await expect(page.getByTestId('submit-button')).toBeVisible();

  return { finishCalls: () => finishCallCount };
}

test.describe('Execution finish confirmations', () => {
  test('declining sync keeps the inspection in finishing and guides the inspector', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2099-12-31',
      withInspectionAppLink: true,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('sync-confirm-modal')).toBeVisible();

    await page.getByTestId('sync-confirm-no').click();
    await expect(page.getByTestId('sync-confirm-modal')).not.toBeVisible();
    await expect(
      page.getByText('Sync the inspection in the Inspection App before completing.'),
    ).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    expect(finishCalls()).toBe(0);
  });

  test('sync confirmation chains into the past-time warning and completes', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2020-01-01',
      withInspectionAppLink: true,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('sync-confirm-modal')).toBeVisible();

    await page.getByTestId('sync-confirm-yes').click();
    await expect(page.getByTestId('past-time-confirm-modal')).toBeVisible();
    expect(finishCalls()).toBe(0);

    await page.getByTestId('past-time-confirm').click();
    await expect(page.getByText('Inspection Complete')).toBeVisible();
    expect(finishCalls()).toBe(1);
  });

  test('cancelling the past-time warning does not submit', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2020-01-01',
      withInspectionAppLink: false,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('past-time-confirm-modal')).toBeVisible();

    await page.getByTestId('past-time-cancel').click();
    await expect(page.getByTestId('past-time-confirm-modal')).not.toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    expect(finishCalls()).toBe(0);
  });

  test('completes directly when no confirmation applies', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2099-12-31',
      withInspectionAppLink: false,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByText('Inspection Complete')).toBeVisible();
    expect(finishCalls()).toBe(1);
  });
});
