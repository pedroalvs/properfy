import type { PrismaClient } from '@prisma/client';
import type {
  IInspectorRatingReader,
  InspectorRatingAggregate,
} from '../domain/inspector-rating.reader';

export class PrismaInspectorRatingReader implements IInspectorRatingReader {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Two `groupBy` round-trips run concurrently.
   *
   * Both are index-backed, but only because this feature added the indexes that
   * serve them: `satisfaction_surveys(inspector_id, tenant_id, submitted_at)` and
   * `appointments(inspector_id, status)`. The latter matters — every pre-existing
   * index on `appointments` leads with `tenant_id`, and this count is deliberately
   * platform-wide, so without it the groupBy degrades to a sequential scan on the
   * busiest read in the admin UI.
   *
   * `groupBy` rather than a single `$queryRaw`: `_count._all` comes back as a JS
   * number and `_avg.rating` as `number | null`, so there is no bigint to cast.
   * A hand-written `COUNT(*)` would return a bigint that throws on JSON
   * serialisation unless cast `::int`.
   */
  async getAggregatesByInspectorIds(
    inspectorIds: string[],
  ): Promise<Map<string, InspectorRatingAggregate>> {
    const result = new Map<string, InspectorRatingAggregate>();
    if (inspectorIds.length === 0) return result;

    const [ratings, doneCounts] = await Promise.all([
      this.prisma.satisfactionSurvey.groupBy({
        by: ['inspector_id'],
        where: { inspector_id: { in: inspectorIds } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['inspector_id'],
        // `deleted_at: null` matters: a soft-deleted appointment must not
        // inflate the inspector's completed-services count.
        where: { inspector_id: { in: inspectorIds }, status: 'DONE', deleted_at: null },
        _count: { _all: true },
      }),
    ]);

    const ratingByInspector = new Map(ratings.map((row) => [row.inspector_id, row]));
    const doneByInspector = new Map(doneCounts.map((row) => [row.inspector_id, row]));

    // Seed every requested id so callers never have to distinguish "absent from
    // the map" from "has no responses" — both mean the same thing to the UI.
    for (const inspectorId of inspectorIds) {
      const rating = ratingByInspector.get(inspectorId);
      result.set(inspectorId, {
        inspectorId,
        // Deliberately NOT rounded here. Rounding is a display concern owned by
        // `formatRatingAverage`, and rounding twice with different rules (round
        // vs toFixed) disagrees on reachable averages such as 1.075. The raw mean
        // is also the honest value to sort on.
        averageRating: rating?._avg.rating ?? null,
        responseCount: rating?._count._all ?? 0,
        doneServicesCount: doneByInspector.get(inspectorId)?._count._all ?? 0,
      });
    }

    return result;
  }
}
