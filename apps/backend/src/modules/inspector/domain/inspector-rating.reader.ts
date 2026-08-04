export interface InspectorRatingAggregate {
  inspectorId: string;
  /**
   * Mean satisfaction rating, or `null` when the inspector has no responses.
   *
   * Never `0` for "unrated": callers render an empty state on `null`, and a zero
   * would both read as a terrible score and sort above real ratings.
   */
  averageRating: number | null;
  responseCount: number;
  /** Total inspections this inspector has completed (`DONE`, not soft-deleted). */
  doneServicesCount: number;
}

/**
 * Reads per-inspector reputation figures.
 *
 * Deliberately a port on the *inspector* module rather than a method on the
 * survey repository: the figures combine both tables, and neither module should
 * own the other's schema. Always batched — the inspector list resolves a whole
 * page in one call.
 */
export interface IInspectorRatingReader {
  getAggregatesByInspectorIds(
    inspectorIds: string[],
  ): Promise<Map<string, InspectorRatingAggregate>>;
}
