/**
 * How long reliability snapshots are kept (L-F07-12). 400 days (13 months)
 * covers any annual F08 period with margin; at ~200 inspectors the ceiling is
 * ~80k rows. The daily SCHEDULED compute purges rows older than this (and all
 * rows of soft-deleted inspectors) in the same transaction.
 */
export const RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400;
