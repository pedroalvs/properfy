/**
 * Contact list phone search — real-database verification.
 *
 * The contacts list search box (`GET /v1/contacts`) advertises
 * "Name, email, phone...". Before this fix it did a raw Prisma `contains` on
 * the typed term, but phones are stored canonically as E.164 (+61412345678),
 * so a natural local-format search ("0412 345 678") never substring-matched
 * and returned nothing. Secondary phones (in additional_channels_json) were
 * never searched at all.
 *
 * The filter is a Prisma `where` built in `buildWhere` (used by both `findAll`
 * and `count`), so a mocked repository would pass regardless of what the OR
 * matches. This pins it on PostgreSQL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import type { ContactScope } from '../../../src/modules/contact/domain/contact.scope';

const PAGINATION = { page: 1, pageSize: 50, sortOrder: 'asc' as const };
const SCOPE: ContactScope = { kind: 'global' };

describe('contact list phone search (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaContactRepository;
  let targetId: string;
  let decoyId: string;

  async function search(term: string) {
    const filters = { search: term };
    const [rows, total] = await Promise.all([
      repo.findAll(filters, PAGINATION, SCOPE),
      repo.count(filters, SCOPE),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaContactRepository(prisma);

    const suffix = Math.random().toString(16).slice(2, 10);
    const tenant = await prisma.tenant.create({
      data: { name: 'CLPS Tenant', legal_name: `CLPS LLC ${suffix}`, status: 'ACTIVE' },
    });

    // Target: canonical E.164 primary phone + a secondary PHONE channel, exactly
    // as the create/update use cases persist them.
    const target = await prisma.contact.create({
      data: {
        tenant_id: tenant.id,
        type: 'RENTAL_TENANT',
        display_name: 'Target Tenant',
        primary_email: `target-${suffix}@test.local`,
        primary_phone: '+61412345678',
        additional_channels_json: [
          { channel: 'PHONE', value: '+61498887777', label: 'Work' },
        ],
        is_active: true,
      },
    });
    targetId = target.id;

    // Decoy with a different number so a phone match must resolve to one row.
    const decoy = await prisma.contact.create({
      data: {
        tenant_id: tenant.id,
        type: 'RENTAL_TENANT',
        display_name: 'Zzz Decoy',
        primary_email: `decoy-${suffix}@test.local`,
        primary_phone: '+61455554444',
        additional_channels_json: [],
        is_active: true,
      },
    });
    decoyId = decoy.id;
  }, 180_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('finds the contact by a local-format primary phone — the reported gap', async () => {
    const { ids, total } = await search('0412345678');
    expect(ids).toEqual([targetId]);
    expect(total).toBe(1);
  });

  it('finds the contact by a spaced local primary phone', async () => {
    const { ids } = await search('0412 345 678');
    expect(ids).toEqual([targetId]);
  });

  it('finds the contact by the E.164 primary phone (no regression)', async () => {
    const { ids } = await search('+61412345678');
    expect(ids).toEqual([targetId]);
  });

  it('finds the contact by a secondary phone stored in additional_channels_json', async () => {
    const { ids } = await search('0498 887 777');
    expect(ids).toEqual([targetId]);
  });

  it('does not match the decoy holding a different number', async () => {
    const { ids } = await search('0412345678');
    expect(ids).not.toContain(decoyId);
  });

  it('still finds the contact by name (no regression)', async () => {
    const { ids } = await search('Target');
    expect(ids).toEqual([targetId]);
  });

  it('returns nothing for a phone that matches no contact', async () => {
    const { ids, total } = await search('0400 000 000');
    expect(ids).toHaveLength(0);
    expect(total).toBe(0);
  });
});
