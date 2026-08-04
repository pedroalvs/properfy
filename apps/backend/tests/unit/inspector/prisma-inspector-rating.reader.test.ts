import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaInspectorRatingReader } from '../../../src/modules/inspector/infrastructure/prisma-inspector-rating.reader';

describe('PrismaInspectorRatingReader', () => {
  const prisma = {
    satisfactionSurvey: { groupBy: vi.fn() },
    appointment: { groupBy: vi.fn() },
  };

  const reader = new PrismaInspectorRatingReader(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.satisfactionSurvey.groupBy.mockResolvedValue([]);
    prisma.appointment.groupBy.mockResolvedValue([]);
  });

  it('returns an empty map without touching the database for an empty id list', async () => {
    const result = await reader.getAggregatesByInspectorIds([]);

    expect(result.size).toBe(0);
    expect(prisma.satisfactionSurvey.groupBy).not.toHaveBeenCalled();
    expect(prisma.appointment.groupBy).not.toHaveBeenCalled();
  });

  it('resolves a whole page of inspectors with exactly two queries', async () => {
    // The N+1 guard. A per-inspector query would make the inspector list issue
    // one round-trip per row, which is the failure this batched reader exists
    // to prevent.
    prisma.satisfactionSurvey.groupBy.mockResolvedValue([
      { inspector_id: 'a', _avg: { rating: 4.8 }, _count: { _all: 12 } },
      { inspector_id: 'b', _avg: { rating: 3 }, _count: { _all: 1 } },
    ]);
    prisma.appointment.groupBy.mockResolvedValue([
      { inspector_id: 'a', _count: { _all: 245 } },
      { inspector_id: 'c', _count: { _all: 7 } },
    ]);

    const result = await reader.getAggregatesByInspectorIds(['a', 'b', 'c']);

    expect(prisma.satisfactionSurvey.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.appointment.groupBy).toHaveBeenCalledTimes(1);
    expect(result.get('a')).toEqual({
      inspectorId: 'a',
      averageRating: 4.8,
      responseCount: 12,
      doneServicesCount: 245,
    });
    // 'b' has ratings but no completed row; 'c' has completed work but no
    // ratings. Both are only correct if the two maps are read independently —
    // 'c' in particular is the everyday new-inspector case.
    expect(result.get('b')).toEqual({
      inspectorId: 'b',
      averageRating: 3,
      responseCount: 1,
      doneServicesCount: 0,
    });
    expect(result.get('c')).toEqual({
      inspectorId: 'c',
      averageRating: null,
      responseCount: 0,
      doneServicesCount: 7,
    });
  });

  it('reports a rating from the very first response', async () => {
    // No minimum-count threshold by product decision: one response is a rating.
    prisma.satisfactionSurvey.groupBy.mockResolvedValue([
      { inspector_id: 'b', _avg: { rating: 3 }, _count: { _all: 1 } },
    ]);

    const result = await reader.getAggregatesByInspectorIds(['b']);

    expect(result.get('b')).toMatchObject({ averageRating: 3, responseCount: 1 });
  });

  it('distinguishes "no responses" from a zero score', async () => {
    // null, never 0 — the UI branches on this to render "—" instead of "0.00",
    // and a 0 would also sort above real ratings on an ascending sort.
    const result = await reader.getAggregatesByInspectorIds(['c']);

    expect(result.get('c')).toEqual({
      inspectorId: 'c',
      averageRating: null,
      responseCount: 0,
      doneServicesCount: 0,
    });
  });

  it('returns an entry for every requested inspector, even unknown ones', async () => {
    const result = await reader.getAggregatesByInspectorIds(['x', 'y']);

    expect([...result.keys()].sort()).toEqual(['x', 'y']);
  });

  it('reports the raw mean and leaves rounding to the display layer', async () => {
    // Rounding here as well as in formatRatingAverage would be two rules that
    // disagree on reachable averages (1.075 among them), and the unrounded mean
    // is the honest value to sort on.
    prisma.satisfactionSurvey.groupBy.mockResolvedValue([
      { inspector_id: 'a', _avg: { rating: 4.666666666 }, _count: { _all: 3 } },
    ]);

    const result = await reader.getAggregatesByInspectorIds(['a']);

    expect(result.get('a')?.averageRating).toBe(4.666666666);
  });

  it('counts only DONE appointments that are not soft-deleted', async () => {
    await reader.getAggregatesByInspectorIds(['a']);

    const [args] = prisma.appointment.groupBy.mock.calls[0];
    expect(args.where).toMatchObject({
      inspector_id: { in: ['a'] },
      status: 'DONE',
      deleted_at: null,
    });
  });
});
