/**
 * Real-Postgres coverage for the one-off inspector login-account backfill
 * (`src/scripts/backfill-inspector-login-account.ts`).
 *
 * This one is run by hand against staging and production, so its first
 * execution must not be there. Every branch is exercised on live rows: the two
 * repairs (link an existing INSP account, create and link a new one), the three
 * cases it must refuse to guess at — each of which would leave two accounts
 * sharing one login identity for `findByEmail` (a `findFirst`) to resolve at
 * random — plus the promises that a dry run writes nothing and a second run is
 * a no-op.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  backfillInspectorLoginAccount,
  findTenantScopedLinkedAccounts,
} from '../../../src/scripts/backfill-inspector-login-account';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

/** Every case keys off a unique address so scenarios cannot collide. */
function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID()}@inspect.com`;
}

async function makeInspector(
  email: string,
  overrides: { status?: 'ACTIVE' | 'INACTIVE'; userId?: string | null; deletedAt?: Date } = {},
): Promise<string> {
  const row = await harness.prisma.inspector.create({
    data: {
      name: 'Backfill Inspector',
      email,
      phone: '+61400000000',
      status: overrides.status ?? 'ACTIVE',
      user_id: overrides.userId ?? null,
      deleted_at: overrides.deletedAt ?? null,
      payment_settings_json: {},
      service_types_json: [],
      blocked_clients_json: [],
    },
    select: { id: true },
  });
  return row.id;
}

async function makeUser(
  email: string,
  overrides: { role?: 'INSP' | 'CL_ADMIN' | 'AM'; tenantId?: string | null } = {},
): Promise<string> {
  const row = await harness.prisma.user.create({
    data: {
      tenant_id: overrides.tenantId ?? null,
      role: overrides.role ?? 'INSP',
      name: 'Existing Account',
      email,
      status: 'ACTIVE',
      password_hash: await bcrypt.hash('Whatever@1', 4),
    },
    select: { id: true },
  });
  return row.id;
}

async function makeTenant(): Promise<string> {
  // legal_name is @unique, so it has to vary per call.
  const suffix = crypto.randomUUID().slice(0, 8);
  const row = await harness.prisma.tenant.create({
    data: { name: `T-${suffix}`, legal_name: `T-${suffix} LLC`, status: 'ACTIVE' },
    select: { id: true },
  });
  return row.id;
}

describe('backfillInspectorLoginAccount — repairs', () => {
  it('links an inspector to the unlinked INSP account already holding its email', async () => {
    const email = uniqueEmail('link');
    const userId = await makeUser(email);
    const inspectorId = await makeInspector(email);

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBe(userId);
  });

  it('creates and links an account when nothing holds the email', async () => {
    const email = uniqueEmail('create');
    const inspectorId = await makeInspector(email);

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).not.toBeNull();

    const user = await harness.prisma.user.findUnique({
      where: { id: row!.user_id! },
      select: { role: true, tenant_id: true, status: true, email: true, password_hash: true },
    });
    expect(user?.role).toBe('INSP');
    expect(user?.tenant_id).toBeNull();
    expect(user?.status).toBe('ACTIVE');
    expect(user?.email).toBe(email);
    // Unusable by design — the operator sets a real one via Reset Password.
    expect(user?.password_hash).toBeTruthy();
    await expect(bcrypt.compare('', user!.password_hash)).resolves.toBe(false);
  });

  it('mirrors an inactive inspector so the created account cannot be used', async () => {
    const email = uniqueEmail('inactive');
    const inspectorId = await makeInspector(email, { status: 'INACTIVE' });

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    const user = await harness.prisma.user.findUnique({
      where: { id: row!.user_id! },
      select: { status: true },
    });
    expect(user?.status).toBe('INACTIVE');
  });

  it('normalises a mixed-case email onto the created account', async () => {
    // Login lowercases what is typed and findByEmail matches exactly, so an
    // account created from the raw stored value would be unreachable.
    const local = `mixed-${crypto.randomUUID().slice(0, 8)}`;
    const inspectorId = await makeInspector(`${local}@Inspect.COM`);

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    const user = await harness.prisma.user.findUnique({
      where: { id: row!.user_id! },
      select: { email: true },
    });
    expect(user?.email).toBe(`${local}@inspect.com`);
  });
});

describe('backfillInspectorLoginAccount — refuses to guess', () => {
  it('skips an email held by a non-inspector account', async () => {
    const email = uniqueEmail('clash-role');
    await makeUser(email, { role: 'CL_ADMIN', tenantId: await makeTenant() });
    const inspectorId = await makeInspector(email);

    const summary = await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    expect(
      summary.skipped.some(
        (s) => s.inspectorId === inspectorId && s.reason === 'email_taken_by_non_inspector',
      ),
    ).toBe(true);
    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBeNull();
    // And no second account was minted on that address.
    expect(await harness.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('skips an INSP account already claimed by another inspector', async () => {
    const email = uniqueEmail('claimed');
    const userId = await makeUser(email);
    const owner = await makeInspector(uniqueEmail('owner'), { userId });
    const inspectorId = await makeInspector(email);

    const summary = await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    expect(
      summary.skipped.some(
        (s) => s.inspectorId === inspectorId && s.reason === 'inspector_user_already_linked',
      ),
    ).toBe(true);
    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBeNull();
    // The rightful owner keeps its link.
    const ownerRow = await harness.prisma.inspector.findUnique({
      where: { id: owner },
      select: { user_id: true },
    });
    expect(ownerRow?.user_id).toBe(userId);
  });

  it('cannot encounter several live accounts on one email — the database forbids it', async () => {
    // `users_email_key` is a PARTIAL unique index (WHERE deleted_at IS NULL),
    // added by 20260406000002_email_reuse_after_soft_delete. schema.prisma
    // declares only @@index([email]), so reading the model suggests otherwise —
    // pinned here because that drift misled two reviews of this feature.
    const email = uniqueEmail('duplicated');
    await makeUser(email);

    await expect(makeUser(email, { role: 'CL_ADMIN' })).rejects.toMatchObject({ code: 'P2002' });

    // A soft-deleted row is outside the index, so the pair CAN exist — and the
    // script's `deleted_at: null` filter is what keeps it seeing exactly one.
    await harness.prisma.user.updateMany({ where: { email }, data: { deleted_at: new Date() } });
    const revived = await makeUser(email);
    const inspectorId = await makeInspector(email);

    const summary = await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    expect(summary.skipped.some((s) => s.inspectorId === inspectorId)).toBe(false);
    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBe(revived);
  });

  it('leaves soft-deleted inspectors alone', async () => {
    const email = uniqueEmail('deleted');
    const inspectorId = await makeInspector(email, { deletedAt: new Date() });

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBeNull();
    expect(await harness.prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe('backfillInspectorLoginAccount — safety properties', () => {
  it('writes nothing on a dry run', async () => {
    const email = uniqueEmail('dry');
    const inspectorId = await makeInspector(email);

    const summary = await backfillInspectorLoginAccount(harness.prisma, { apply: false });

    expect(summary.dryRun).toBe(true);
    expect(summary.createdAndLinked).toBeGreaterThanOrEqual(1);
    const row = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(row?.user_id).toBeNull();
    expect(await harness.prisma.user.count({ where: { email } })).toBe(0);
  });

  it('is a no-op on a second run', async () => {
    const email = uniqueEmail('idempotent');
    const inspectorId = await makeInspector(email);

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });
    const afterFirst = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(afterFirst?.user_id).not.toBeNull();

    await backfillInspectorLoginAccount(harness.prisma, { apply: true });

    // Asserted per inspector rather than on a global scanned count: the skip
    // cases seeded by the other tests stay unlinked by design, so a sweep of
    // this shared database always has rows left to scan.
    const afterSecond = await harness.prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { user_id: true },
    });
    expect(afterSecond?.user_id).toBe(afterFirst?.user_id);
    expect(await harness.prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe('findTenantScopedLinkedAccounts', () => {
  it('reports a linked account the sync and reset paths cannot reach', async () => {
    // Both scope to tenant_id IS NULL, so a tenant-scoped linked account
    // silently no-ops on update and 404s on reset.
    const email = uniqueEmail('tenant-scoped');
    const tenantId = await makeTenant();
    const userId = await makeUser(email, { tenantId });
    const inspectorId = await makeInspector(email, { userId });

    const found = await findTenantScopedLinkedAccounts(harness.prisma);

    expect(found).toContainEqual({ inspectorId, userId, tenantId });
  });
});
