import type { InspectorNoticeAudience } from '@properfy/shared';

export type { InspectorNoticeAudience };

/** Resolved recipient of a notice, materialized at publish time. */
export interface ResolvedRecipient {
  inspectorId: string;
}
