/**
 * Read-only guard used by the level-change message step (L-F08-06): has a system
 * notice whose dedupe key starts with `dedupeKeyPrefix` been created at/after `since`?
 * Implemented over the F02 system-notice read (never queries `inspector_notices`
 * directly from this module — Clean Architecture seam).
 */
export interface IRecentProgramNoticeReader {
  hasRecentNotice(dedupeKeyPrefix: string, since: Date): Promise<boolean>;
}
