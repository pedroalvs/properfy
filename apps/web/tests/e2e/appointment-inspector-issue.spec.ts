import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockAppointmentDetail,
  mockFormOptions,
  makeAppointment,
} from './helpers';

const OP_USER = {
  id: 'user-op-1',
  name: 'Olivia Operator',
  email: 'op@properfy.me',
  role: 'OP',
  tenantId: null,
};

const INSPECTOR_ISSUE = {
  reason: 'KEY_FAILED',
  note: 'Lockbox code did not work',
  inspectorId: 'insp-1',
  inspectorName: 'Inspector Smith',
  occurredAt: '2026-04-20T09:41:00+10:00',
};

const rejectedAppointment = makeAppointment({
  id: 'apt-issue-1',
  code: 'APT-3001',
  appointmentNumber: 3001,
  status: 'REJECTED',
  rejectionReasonCode: 'INSPECTOR_UNABLE',
  reason: 'Key did not work',
  inspectorIssue: INSPECTOR_ISSUE,
});

async function mockFieldActivity(page: Page) {
  await page.route('**/v1/appointments/*/field-activity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          execution: null,
          events: [
            {
              id: 'ev-1',
              type: 'CANT_DO',
              reason: 'KEY_FAILED',
              note: 'Lockbox code did not work',
              minutesLate: null,
              inspectorName: 'Inspector Smith',
              occurredAt: '2026-04-20T09:41:00+10:00',
              clientOccurredAt: null,
              accuracyMeters: null,
            },
          ],
        },
      }),
    });
  });
}

async function mockAuditLogs(page: Page) {
  await page.route('**/v1/audit-logs**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'log-1',
            tenantId: 'tenant-1',
            actorType: 'SYSTEM',
            actorId: null,
            actorName: null,
            entityType: 'Appointment',
            entityId: 'apt-issue-1',
            action: 'inspector_field_event.cant_do',
            reason: null,
            beforeJson: null,
            afterJson: null,
            requestId: null,
            ipAddress: null,
            metadataJson: null,
            createdAt: '2026-04-20T09:41:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
    });
  });
}

test.describe('Appointment inspector-issue card + timeline (00.A3 web)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, [rejectedAppointment]);
    await mockAppointmentDetail(page, rejectedAppointment);
    await mockFieldActivity(page);
    await mockAuditLogs(page);
  });

  test('shows the "Inspector couldn\'t complete" card on the detail', async ({ page }) => {
    await page.goto(`/appointments/${rejectedAppointment.id}`);
    await expect(page.getByText("Inspector couldn't complete")).toBeVisible();
    await expect(page.getByText("Reason: Key didn't work")).toBeVisible();
    await expect(page.getByText(/Reported by Inspector Smith \(current inspector\)/)).toBeVisible();
  });

  test('labels the "Inspector Couldn\'t Complete" entry on the Timeline tab', async ({ page }) => {
    await page.goto(`/appointments/${rejectedAppointment.id}`);
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.getByText("Inspector Couldn't Complete")).toBeVisible();
  });
});
