import { test } from '@playwright/test';
import { setupAuth, mockMeEndpoint, mockAppointmentList, mockFormOptions, makeAppointment, AM_USER } from './helpers';

test('screenshot: change status mode', async ({ page }) => {
  await setupAuth(page);
  await mockMeEndpoint(page, { ...AM_USER, role: 'OP' });
  await mockFormOptions(page);
  await mockAppointmentList(page, [
    makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    makeAppointment({ id: 'apt-2', code: 'APT-1002', appointmentNumber: 1002, status: 'DRAFT' }),
  ]);
  await page.goto('/appointments');
  await page.getByLabel('Select appointment APT-1001').check();
  await page.getByLabel('Select appointment APT-1002').check();
  await page.getByText(/Bulk Edit/).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('label:has-text("Change status") input[type="checkbox"]').check();
  await dialog.getByLabel('Set target status').click();
  await dialog.getByRole('option', { name: 'Cancelled' }).click();
  await dialog.getByLabel('Status change reason').fill('Tenant moved out');
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-pedro-Code-GitHub-properfy/af397ea4-ec4f-421b-b5fe-58291a49f556/scratchpad/bulk-change-status.png' });
});
