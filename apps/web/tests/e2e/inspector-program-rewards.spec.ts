import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { setupAuth, mockMeEndpoint, AM_USER } from './helpers';

/**
 * 03.A4 (web E2E). Proves the Rewards flow end to end at the UI level: a goal
 * reached and closed appears in the Rewards panel for its period, is summed into
 * "Achieved", and can be approved. The form also creates a goal (CRUD proof), and
 * a CL_ADMIN is denied the route (Q18).
 *
 * The web E2E suite is hermetic (every API call is stubbed — it is the CI
 * `test-web-e2e` gate), so this spec stubs a closed period with an achieved award
 * rather than seeding a real backend. TASK-F08-6 (invoice "Paid") is the natural
 * place for a real-backend extension of this flow.
 */

const CL_ADMIN_USER = { id: 'user-cl-1', name: 'Agency Admin', email: 'cl@acme.test', role: 'CL_ADMIN', tenantId: 'tenant-1' };

function addDays(civil: string, n: number): string {
  const d = new Date(`${civil}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 2026-11-09 is a Monday (current, in-progress); 2026-11-02 is the last closed week.
function weeklyUpcoming(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const start = addDays('2026-11-09', i * 7);
    return { start, end: addDays(start, 6), status: i === 0 ? 'IN_PROGRESS' : 'UPCOMING' };
  });
}
function weeklyPast(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const start = addDays('2026-11-02', -i * 7);
    return { start, end: addDays(start, 6), status: 'CLOSED' };
  });
}

const CREATED_GOAL = {
  id: 'goal-new', title: 'E2E goal', metric: 'VOLUME', comparator: 'GTE', target: 10, period: 'WEEKLY',
  scopeRegionId: null, scopeServiceTypeId: null, scopeInspectorId: null,
  scopeRegionName: null, scopeServiceTypeName: null, scopeInspectorName: null,
  rewardAmount: 30, startsAt: '2026-11-16', endsAt: null, active: true, deactivatedAt: null,
  pendingChange: null, resumesOn: null, minEndsAt: '2026-11-22', currentPeriod: null, lastClosedPeriod: null,
  scopeRegionDeleted: false, createdByUserId: AM_USER.id, updatedByUserId: null,
  createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z',
};

function pendingAward(status: 'PENDING' | 'APPROVED') {
  return {
    id: 'award-1', goalId: 'goal-1', inspectorId: 'insp-1', periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08',
    goalTitle: 'Weekly ten', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
    achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-07', indexScoreAtClose: 88.3, levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08', status, approvedByUserId: null, approvedByName: null, approvedAt: null,
    paidAt: null, voidedByUserId: null, voidedByName: null, voidedAt: null, voidReason: null, inspectorNote: null,
    goal: { id: 'goal-1', title: 'Weekly ten' }, inspector: { id: 'insp-1', name: 'Jane Doe', email: 'jane@acme.test' },
    createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z',
  };
}

function closedSummary() {
  return {
    periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'CLOSED',
    totals: { promised: 90, achieved: 30, approved: 0, paid: 0, pending: 30, voided: 0 },
    goals: [{ goalId: 'goal-1', title: 'Weekly ten', metric: 'VOLUME', rewardAmount: 30, participants: 3, promised: 90, achievers: 1, achievedAmount: 30, closed: true, skipped: false }],
  };
}
function inProgressSummary() {
  return { ...closedSummary(), periodStart: '2026-11-09', status: 'IN_PROGRESS' };
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
}

async function mockProgram(page: Page) {
  let approved = false;

  await page.route('**/v1/inspector-program/periods**', async (route) => {
    const url = new URL(route.request().url());
    const direction = url.searchParams.get('direction');
    const count = Number(url.searchParams.get('count') ?? '12');
    await json(route, direction === 'past' ? weeklyPast(count) : weeklyUpcoming(count));
  });

  await page.route('**/v1/inspector-program/summary**', async (route) => {
    const start = new URL(route.request().url()).searchParams.get('periodStart');
    await json(route, start === '2026-11-09' ? inProgressSummary() : closedSummary());
  });

  await page.route('**/v1/inspector-program/awards**', async (route) => {
    const url = route.request().url();
    if (url.includes('/approve')) {
      approved = true;
      return json(route, { ...pendingAward('APPROVED') });
    }
    await json(route, [pendingAward(approved ? 'APPROVED' : 'PENDING')]);
  });

  await page.route('**/v1/inspector-program/goals**', async (route) => {
    if (route.request().method() === 'POST') return json(route, CREATED_GOAL, 201);
    await json(route, []); // list + cumulative-advisory query
  });

  for (const path of ['**/v1/service-regions**', '**/v1/service-types**']) {
    await page.route(path, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'x1', name: 'Sydney North' }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }),
      });
    });
  }
}

test.describe('Inspector program — Goals & rewards (03.A4)', () => {
  test('AM creates a goal, reviews the closed period and approves the reward', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockProgram(page);

    await page.goto('/goals-rewards');
    await expect(page.getByRole('heading', { name: 'Goals & rewards' })).toBeVisible();

    // CRUD: create a goal through the form.
    await page.getByRole('button', { name: 'New goal' }).click();
    await expect(page.getByRole('heading', { name: 'New goal' })).toBeVisible();
    await page.getByLabel('Title').fill('E2E goal');
    await page.getByLabel('Target').fill('10');
    await page.getByLabel('Bonus (AUD)').fill('30');
    await page.getByRole('button', { name: 'Starts' }).click();
    await page.getByRole('option', { name: 'Week of Mon 16 Nov 2026' }).click();
    await page.getByRole('button', { name: 'Create goal' }).click();
    await expect(page.getByText('Goal created')).toBeVisible();

    // Rewards: open the closed period and see the achieved reward.
    await page.getByRole('tab', { name: 'Rewards' }).click();
    await page.getByRole('button', { name: 'Period' }).click();
    await page.getByRole('option', { name: 'Week of Mon 2 Nov 2026' }).click();

    // "Promised" is the unambiguous tiles-loaded signal ("Achieved" also appears as
    // the per-goal table's column header → strict-mode collision).
    await expect(page.getByText('Promised')).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('Pending review')).toBeVisible();

    // Approve it.
    await page.getByRole('button', { name: 'Approve reward for Jane Doe' }).click();
    await expect(page.getByText('Reward approved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve reward for Jane Doe' })).toHaveCount(0);
  });

  test('CL_ADMIN is denied the Goals & rewards route (Q18)', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, CL_ADMIN_USER);
    await mockProgram(page);

    await page.goto('/goals-rewards');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Goals & rewards' })).toHaveCount(0);
  });
});
