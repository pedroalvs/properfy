/**
 * Inspector notices (F02-2, web AM/OP) — view-model types.
 *
 * The notice domain is platform-scoped (no `tenant_id`; the inspector is
 * cross-tenant). The backend contract (F02-1) owns the wire types — re-exported
 * here so the feature imports from one place.
 */
export type {
  InspectorNoticeSummary,
  InspectorNoticeDetail,
  InspectorNoticeAudience,
  InspectorNoticeAudienceInput,
  PublishInspectorNoticeInput,
} from '@properfy/shared';

/** Status segment for the list filter. */
export type InspectorNoticeStatusFilter = 'active' | 'archived' | 'all';

/** Audience radio choice in the New notice drawer. */
export type AudienceKind = 'ALL' | 'SELECTED' | 'REGION';

/** An active inspector option for the multi-select. */
export interface InspectorOption {
  id: string;
  name: string;
  email: string | null;
}

/** An active region option for the region select. */
export interface RegionOption {
  id: string;
  name: string;
  inspectorCount: number;
}
