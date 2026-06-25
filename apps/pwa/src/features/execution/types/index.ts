export type ExecutionPhase =
  | 'PRE_START'
  | 'IN_PROGRESS'
  | 'FINISHING'
  | 'SUBMITTING'
  | 'DONE'
  | 'ERROR';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export type ChecklistItemType = 'BOOLEAN' | 'TEXT' | 'RATING';

export interface ChecklistTemplateItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required: boolean;
  category: string;
}

export interface ChecklistResponse {
  itemId: string;
  value: boolean | string | number | null;
}

export type AssetUploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface AssetUploadState {
  localId: string;
  assetId: string | null;
  filename: string;
  contentType: string;
  blobUrl: string;
  status: AssetUploadStatus;
  progress: number;
  uploadUrl: string | null;
  storageKey: string | null;
}

export interface ExecutionState {
  appointmentId: string;
  phase: ExecutionPhase;
  pendingSync: boolean;
  startLocation: CapturedLocation | null;
  finishLocation: CapturedLocation | null;
  checklistTemplate: ChecklistTemplateItem[];
  checklistResponses: ChecklistResponse[];
  notes: string;
  assets: AssetUploadState[];
  startedAt: string | null;
  errorMessage: string | null;
  lastSavedAt: string | null;
}
