/**
 * Q12 (F08-6): the INSPECTOR_BONUS ledger entry is the platform↔inspector leg and has a NULL
 * tenant_id. No agency surface may ever expose it. These are WHERE-clause behaviours (a mocked
 * repo would hide the bug), so they run against a real PostgreSQL database.
 *
 * Fixture — agency A: a TENANT_DEBIT (agency-visible) + a platform INSPECTOR_BONUS for an inspector
 * who services A. Agency B: a TENANT_DEBIT control (agency-visible by type). Proves the bonus is
 * invisible to CL (list, detail→404, summary) yet visible to AM (platform-wide), to OP (via the
 * includePlatformBonus predicate) and to the inspector (own leg).
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { ListFinancialEntriesUseCase } from '../../../src/modules/billing/application/use-cases/list-financial-entries.use-case';
import { GetFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-entry.use-case';
import { GetFinancialSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-summary.use-case';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { EntryNotFoundError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

const rnd = () => Math.random().toString(36).slice(2, 10);
const silentAudit = () => ({ log: () => {} }) as unknown as AuditService;
const clAdmin = (tenantId: string): AuthContext => ({ userId: 'cl', tenantId, role: 'CL_ADMIN', branchId: null, inspectorId: null });
const am = (): AuthContext => ({ userId: 'am', tenantId: null, role: 'AM', branchId: null, inspectorId: null });
const op = (tenantId: string): AuthContext => ({ userId: 'op', tenantId, role: 'OP', branchId: null, inspectorId: null });
const insp = (inspectorId: string): AuthContext => ({ userId: 'ins', tenantId: null, role: 'INSP', branchId: null, inspectorId });
const listInput = (actor: AuthContext, extra: Record<string, unknown> = {}) => ({
  page: 1, pageSize: 50, sortBy: 'effective_at', sortOrder: 'desc' as const, actor, ...extra,
});

describe('INSPECTOR_BONUS never leaks to an agency (real DB, Q12)', () => {
  let harness: DbHarness | undefined;
  let tenantA: string;
  let tenantB: string;
  let inspectorId: string;
  let bonusEntryId: string;
  let listUseCase: ListFinancialEntriesUseCase;
  let getUseCase: GetFinancialEntryUseCase;
  let summaryUseCase: GetFinancialSummaryUseCase;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const { prisma } = harness;

    const a = await prisma.tenant.create({ data: { name: `A ${rnd()}`, legal_name: `A ${rnd()}`, status: 'ACTIVE', currency: 'AUD' } });
    tenantA = a.id;
    const b = await prisma.tenant.create({ data: { name: `B ${rnd()}`, legal_name: `B ${rnd()}`, status: 'ACTIVE', currency: 'AUD' } });
    tenantB = b.id;
    const branchA = await prisma.branch.create({ data: { tenant_id: a.id, name: 'A branch', status: 'ACTIVE' } });
    const userA = await prisma.user.create({
      data: { tenant_id: a.id, branch_id: branchA.id, role: 'OP', name: 'A op', email: `a-${rnd()}@t.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE' },
    });
    const inspector = await prisma.inspector.create({ data: { name: 'Inspector', email: `i-${rnd()}@t.local`, status: 'ACTIVE' } });
    inspectorId = inspector.id;

    // Agency A: one agency-visible debit.
    await prisma.financialEntry.create({
      data: { tenant_id: a.id, currency: 'AUD', status: 'APPROVED', description: 'debit', initiated_by_user_id: userA.id, effective_at: new Date('2026-11-10T00:00:00.000Z'), entry_type: 'TENANT_DEBIT', amount: '100.00' } as never,
    });
    // Agency B control (agency-visible by type — a type-only filter would surface it in A's read).
    await prisma.financialEntry.create({
      data: { tenant_id: b.id, currency: 'AUD', status: 'APPROVED', description: 'debit B', effective_at: new Date('2026-11-10T00:00:00.000Z'), entry_type: 'TENANT_DEBIT', amount: '777.00' } as never,
    });

    // The platform bonus: tenant_id NULL, inspector set, linked to a real reward.
    const goal = await prisma.inspectorGoal.create({
      data: { title: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10, period: 'WEEKLY', reward_amount: 30, starts_at: new Date('2026-11-02T00:00:00.000Z'), created_by_user_id: userA.id },
    });
    const reward = await prisma.rewardAward.create({
      data: {
        goal_id: goal.id, inspector_id: inspector.id, period_type: 'WEEKLY',
        period_start: new Date('2026-11-02T00:00:00.000Z'), period_end: new Date('2026-11-08T00:00:00.000Z'),
        goal_title: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30,
        achieved_value: 12, service_count: 12, achieved_on: new Date('2026-11-08T00:00:00.000Z'),
        status: 'APPROVED', approved_by_user_id: userA.id, approved_at: new Date('2026-11-10T01:00:00.000Z'),
      },
    });
    const bonus = await prisma.financialEntry.create({
      data: { tenant_id: null, currency: 'AUD', status: 'APPROVED', description: 'Bonus: Weekly volume · Week of Mon 2 Nov', initiated_by_user_id: null, approved_by_user_id: userA.id, approved_at: new Date('2026-11-10T01:00:00.000Z'), effective_at: new Date('2026-11-10T01:00:00.000Z'), entry_type: 'INSPECTOR_BONUS', amount: '30.00', inspector_id: inspector.id, reward_award_id: reward.id } as never,
    });
    bonusEntryId = bonus.id;

    const entryRepo = new PrismaFinancialEntryRepository(prisma);
    listUseCase = new ListFinancialEntriesUseCase(entryRepo, silentAudit());
    getUseCase = new GetFinancialEntryUseCase(entryRepo);
    summaryUseCase = new GetFinancialSummaryUseCase(entryRepo, new PrismaTenantRepository(prisma));
  }, 180_000);

  afterAll(async () => { if (harness) await teardownDbHarness(harness); });

  it('CL_ADMIN list never shows the bonus', async () => {
    const result = await listUseCase.execute(listInput(clAdmin(tenantA)));
    expect(result.data.some((e) => e.entryType === 'INSPECTOR_BONUS')).toBe(false);
    expect(result.data.every((e) => e.tenantId === tenantA)).toBe(true);
  });

  it('CL_ADMIN filtering type=INSPECTOR_BONUS is forbidden (403)', async () => {
    await expect(
      listUseCase.execute(listInput(clAdmin(tenantA), { type: 'INSPECTOR_BONUS' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('CL_ADMIN get bonus by id is 404', async () => {
    await expect(getUseCase.execute({ entryId: bonusEntryId, actor: clAdmin(tenantA) })).rejects.toBeInstanceOf(EntryNotFoundError);
  });

  it('CL_ADMIN summary never counts the bonus (totalBonuses 0)', async () => {
    const summary = await summaryUseCase.execute({ actor: clAdmin(tenantA) });
    expect(summary.totalBonuses).toBe(0);
    expect(summary.totalDebits).toBe(100);
  });

  it('AM sees the bonus platform-wide, but not when scoped to an agency', async () => {
    const all = await listUseCase.execute(listInput(am()));
    expect(all.data.some((e) => e.id === bonusEntryId)).toBe(true);
    const scoped = await listUseCase.execute(listInput(am(), { tenantId: tenantA }));
    expect(scoped.data.some((e) => e.id === bonusEntryId)).toBe(false);
  });

  it('OP sees the platform bonus (includePlatformBonus) but not another agency', async () => {
    const result = await listUseCase.execute(listInput(op(tenantA)));
    expect(result.data.some((e) => e.id === bonusEntryId)).toBe(true);
    expect(result.data.some((e) => Number(e.amount) === 777)).toBe(false);
  });

  it('INSP sees their own bonus and payouts; type=INSPECTOR_BONUS narrows to the bonus', async () => {
    const all = await listUseCase.execute(listInput(insp(inspectorId)));
    expect(all.data.some((e) => e.id === bonusEntryId)).toBe(true);
    const onlyBonus = await listUseCase.execute(listInput(insp(inspectorId), { type: 'INSPECTOR_BONUS' }));
    expect(onlyBonus.data.every((e) => e.entryType === 'INSPECTOR_BONUS')).toBe(true);
    expect(onlyBonus.data.some((e) => e.id === bonusEntryId)).toBe(true);
  });

  it('INSP gets 404 for another inspector bonus is covered by own-scope; own bonus by id works', async () => {
    const own = await getUseCase.execute({ entryId: bonusEntryId, actor: insp(inspectorId) });
    expect(own.entryType).toBe('INSPECTOR_BONUS');
    await expect(getUseCase.execute({ entryId: bonusEntryId, actor: insp('other-inspector') })).rejects.toBeInstanceOf(EntryNotFoundError);
  });
});
