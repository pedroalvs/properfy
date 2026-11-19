import { test, expect } from '@playwright/test';
import { blockUnmockedApi, stubJson } from './support/api';
import { LOGIN_401 } from './support/fixtures';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Hermetic: any /v1/** call without a specific stub returns 501 E2E_UNMOCKED
    // instead of reaching a real backend. No tokens are seeded, so the app boots
    // unauthenticated (AuthProvider never calls /v1/me without tokens).
    await blockUnmockedApi(page);
  });

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('email-input')).toBeVisible();
    await expect(page.getByTestId('password-input')).toBeVisible();
    await expect(page.getByTestId('login-button')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    // Mock the login as a 401 with the invalid-credentials code so the asserted
    // message is deterministic. Without this stub the request would hit the network
    // and surface the generic connection error instead.
    await stubJson(page, '/v1/auth/login', LOGIN_401, 401);

    await page.goto('/login');
    await page.getByTestId('email-input').fill('wrong@test.com');
    await page.getByTestId('password-input').fill('wrongpass');
    await page.getByTestId('login-button').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password.');
  });
});
