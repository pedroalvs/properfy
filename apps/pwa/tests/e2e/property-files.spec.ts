import { test, expect, type Page, type Route } from '@playwright/test';
import { API, stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import {
  APPOINTMENT_DETAIL,
  APPOINTMENT_ID,
  CANT_DO_RESULT,
  PRESIGN_RESULT,
  PROPERTY_FILES_EMPTY,
  PROPERTY_FILE_CONFIRM_PENDING,
  PROPERTY_ISSUE_ID,
  PROPERTY_ISSUE_UPLOAD_URL,
  PROPERTY_ISSUE_WITH_PHOTO,
  PROPERTY_ISSUES_EMPTY,
} from './support/fixtures';

const FILES_PATH = '/v1/property-files';
const ISSUES_PATH = '/v1/property-issues';
const PRESIGN_PATH = '/v1/property-files/presign';
const CONFIRM_PATH = '/v1/property-files/confirm';
const CANT_DO_PATH = `/v1/inspector/appointments/${APPOINTMENT_ID}/cant-do`;

const FAKE_JPEG = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]) };

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Stub the shared photo-upload steps (presign → signed PUT → confirm). */
async function stubPhotoUpload(page: Page): Promise<void> {
  await stubJson(page, PRESIGN_PATH, { data: PRESIGN_RESULT }, 201);
  await page.route(PROPERTY_ISSUE_UPLOAD_URL, (route) => route.fulfill({ status: 200, body: '' }));
  await stubJson(page, CONFIRM_PATH, { data: PROPERTY_FILE_CONFIRM_PENDING });
}

test.describe('Property files — report issue (F10-3)', () => {
  test('report an issue with one photo; it appears in the Issues list', async ({ page }) => {
    await loginAsInspector(page);
    await stubJson(page, `/v1/inspector/appointments/${APPOINTMENT_ID}`, { data: APPOINTMENT_DETAIL });
    await stubJson(page, FILES_PATH, { data: PROPERTY_FILES_EMPTY });
    await stubPhotoUpload(page);

    // One route for /v1/property-issues: GET returns the issue only after the POST.
    let created = false;
    await page.route(
      (url) => url.origin === API && url.pathname === ISSUES_PATH,
      (route) => {
        if (route.request().method() === 'POST') {
          created = true;
          return json(route, { data: PROPERTY_ISSUE_WITH_PHOTO }, 201);
        }
        return json(route, { data: created ? { issues: [PROPERTY_ISSUE_WITH_PHOTO] } : PROPERTY_ISSUES_EMPTY });
      },
    );

    await page.goto(`/schedule/${APPOINTMENT_ID}`);
    await expect(page.getByTestId('property-files-section')).toBeVisible();

    const createRequest = page.waitForRequest(
      (r) => r.url().endsWith(ISSUES_PATH) && r.method() === 'POST',
    );

    await page.getByTestId('report-issue-button').click();
    await page.getByLabel('Reason').fill('Broken window');
    await page.locator('input[type="file"]').setInputFiles(FAKE_JPEG);

    const submit = page.getByTestId('report-issue-submit');
    await expect(submit).toBeEnabled(); // enabled once the photo confirms
    await submit.click();

    const request = await createRequest;
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({
      propertyId: APPOINTMENT_DETAIL.propertyId,
      appointmentId: APPOINTMENT_ID,
      reason: 'Broken window',
      photoFileIds: [PRESIGN_RESULT.fileId],
    });
    expect(request.headers()['idempotency-key']).toBeTruthy();

    await expect(page.getByTestId(`issue-card-${PROPERTY_ISSUE_ID}`)).toBeVisible();
  });
});

test.describe('Property files — photos on "Can\'t do this job" (F10-3, D18)', () => {
  test('cant-do with a photo fires the decline then the linked issue creation', async ({ page }) => {
    await loginAsInspector(page);
    await stubJson(page, `/v1/inspector/appointments/${APPOINTMENT_ID}`, { data: APPOINTMENT_DETAIL });
    await stubJson(page, FILES_PATH, { data: PROPERTY_FILES_EMPTY });
    await stubJson(page, ISSUES_PATH, { data: PROPERTY_ISSUES_EMPTY });
    await stubPhotoUpload(page);
    await stubJson(page, CANT_DO_PATH, { data: CANT_DO_RESULT });

    await page.goto(`/schedule/${APPOINTMENT_ID}`);
    await expect(page.getByTestId('property-files-section')).toBeVisible();

    const cantDoRequest = page.waitForRequest((r) => r.url().endsWith(CANT_DO_PATH) && r.method() === 'POST');
    const createRequest = page.waitForRequest((r) => r.url().endsWith(ISSUES_PATH) && r.method() === 'POST');

    await page.getByTestId('detail-cant-do').click();
    await page.getByLabel("Key didn't work").check();
    await page.locator('input[type="file"]').setInputFiles(FAKE_JPEG);

    const send = page.getByTestId('cant-do-send');
    await expect(send).toBeEnabled(); // enabled once the photo confirms
    await send.click();

    await cantDoRequest; // the decline fires first
    const create = await createRequest;
    expect(JSON.parse(create.postData() ?? '{}')).toMatchObject({
      propertyId: APPOINTMENT_DETAIL.propertyId,
      appointmentId: APPOINTMENT_ID,
      photoFileIds: [PRESIGN_RESULT.fileId],
      cantDoEventId: CANT_DO_RESULT.eventId,
    });

    // The decline navigates the inspector back to the schedule.
    await expect(page).toHaveURL(/\/schedule$/);
  });
});
