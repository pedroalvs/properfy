import { describe, it, expect, vi } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { GetLockedTimeUseCase } from './get-locked-time.use-case';
import type { ILiveDayReadRepository, LockedTimeRawRow } from '../../domain/live-day.read-repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

const FIXED = new Date('2026-11-05T02:00:00.000Z'); // Sydney 13:00 → civil 2026-11-05
const clock = { now: () => FIXED };

function actor(role: UserRole): AuthContext {
  return {
    userId: 'u-1',
    tenantId: role.startsWith('CL') ? 't-1' : null,
    role,
    branchId: null,
    inspectorId: role === 'INSP' ? 'i-1' : null,
    timezone: 'Australia/Sydney',
  };
}

function repoWith(rows: LockedTimeRawRow[]): ILiveDayReadRepository {
  return { getDay: vi.fn(), getLockedTime: vi.fn().mockResolvedValue(rows) };
}

const ROWS: LockedTimeRawRow[] = [
  { dim: 'AGENCY', key: 't-2', label: 'Belle Property', regionAgencyName: null, confirmed: 3, required: 4 },
  { dim: 'AGENCY', key: 't-1', label: 'Ray White', regionAgencyName: null, confirmed: 1, required: 2 },
  { dim: 'REGION', key: 'r-1', label: 'Inner West', regionAgencyName: 'Ray White', confirmed: 2, required: 2 },
  { dim: 'REGION', key: null, label: '', regionAgencyName: null, confirmed: 0, required: 2 },
];

describe('GetLockedTimeUseCase (test 11)', () => {
  it('rejects non AM/OP roles', async () => {
    const uc = new GetLockedTimeUseCase(repoWith([]), clock);
    for (const role of ['CL_ADMIN', 'CL_USER', 'INSP', 'TNT'] as const) {
      await expect(uc.execute({ actor: actor(role), query: {} })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('defaults the range to today → today + 13', async () => {
    const repo = repoWith([]);
    const { response } = await new GetLockedTimeUseCase(repo, clock).execute({ actor: actor('AM'), query: {} });
    expect(response.from).toBe('2026-11-05');
    expect(response.to).toBe('2026-11-18');
    expect(repo.getLockedTime).toHaveBeenCalledWith('2026-11-05', '2026-11-18');
  });

  it('rejects an inverted range', async () => {
    await expect(
      new GetLockedTimeUseCase(repoWith([]), clock).execute({
        actor: actor('OP'),
        query: { from: '2026-11-10', to: '2026-11-09' },
      }),
    ).rejects.toMatchObject({ code: 'LOCKED_TIME_INVALID_RANGE' });
  });

  it('rejects a span over 31 days', async () => {
    await expect(
      new GetLockedTimeUseCase(repoWith([]), clock).execute({
        actor: actor('OP'),
        query: { from: '2026-11-01', to: '2026-12-02' }, // 32 days inclusive
      }),
    ).rejects.toMatchObject({ code: 'LOCKED_TIME_RANGE_TOO_LONG' });
    // 31-day span is allowed.
    await expect(
      new GetLockedTimeUseCase(repoWith([]), clock).execute({
        actor: actor('OP'),
        query: { from: '2026-11-01', to: '2026-12-01' },
      }),
    ).resolves.toBeDefined();
  });

  it('rolls up overall, byAgency (sorted), byRegion (null last) with rounded percent', async () => {
    const { response } = await new GetLockedTimeUseCase(repoWith(ROWS), clock).execute({
      actor: actor('AM'),
      query: {},
    });
    expect(response.overall).toEqual({ confirmed: 4, required: 6, percent: 66.7 });
    expect(response.byAgency.map((a) => a.agencyName)).toEqual(['Belle Property', 'Ray White']);
    expect(response.byAgency[0]).toMatchObject({ tenantId: 't-2', percent: 75 });
    // null region maps to "No region" and sorts last.
    expect(response.byRegion.map((r) => r.regionName)).toEqual(['Inner West', 'No region']);
    expect(response.byRegion[0]).toMatchObject({ regionId: 'r-1', agencyName: 'Ray White', percent: 100 });
    expect(response.byRegion[1]).toMatchObject({ regionId: null, agencyName: null });
  });

  it('percent is null when the denominator is 0', async () => {
    const { response } = await new GetLockedTimeUseCase(repoWith([]), clock).execute({ actor: actor('AM'), query: {} });
    expect(response.overall).toEqual({ confirmed: 0, required: 0, percent: null });
  });
});
