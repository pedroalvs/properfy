# Execution – PWA Feature Spec

> App: Inspector Mobile App (apps/pwa)
> Last updated: 2026-03-15

---

## 1. Overview

The Execution screen is the active inspection flow. It is entered from the Schedule detail screen when an inspector taps "Start Inspection." The flow covers: geolocation capture, inspection start confirmation, checklist completion, photo/document upload, notes entry, and final submission. The screen must handle poor connectivity gracefully, queuing actions when offline and syncing when reconnected.

**App:** Inspector PWA (apps/pwa)
**Auth:** JWT (INSP role)
**Design:** Full-screen, distraction-minimized UI for field use

**Pages/screens:**
1. Execution Screen (`/execution/:appointmentId`) — single page with multi-step in-place UI

---

## 2. Pages & Routes

| Path | Component | Description |
|---|---|---|
| `/execution/:appointmentId` | `ExecutionPage` | Active inspection flow |

Route access:

```tsx
<Route
  path="/execution/:appointmentId"
  element={<InspectorAuthGuard><ExecutionPage /></InspectorAuthGuard>}
/>
```

**Back navigation:** Once an inspection is started (POST /start called), tapping back warns the inspector: "Inspection in progress. Are you sure you want to leave? Your progress is saved locally." Back is allowed but inspection remains in SCHEDULED status (they can return to this URL to resume).

---

## 3. TypeScript Interfaces

```typescript
// Execution state machine (client-side)
type ExecutionPhase =
  | 'PRE_START'         // Before "Start Inspection" tapped; shows geo + confirm
  | 'IN_PROGRESS'       // After start POST succeeds; checklist + photos active
  | 'FINISHING'         // After "Finish" tapped; capturing final geo + confirmation
  | 'SUBMITTING'        // POST to /finish in flight
  | 'DONE'              // Successfully submitted
  | 'ERROR';            // Unrecoverable error

// Geolocation capture
interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;       // meters
  capturedAt: string;     // ISO 8601
}

// Checklist item (template from backend)
interface ChecklistItem {
  id: string;
  label: string;
  category: string;       // e.g. "Exterior", "Kitchen", "Bedrooms"
  required: boolean;
  inputType: 'BOOLEAN' | 'TEXT' | 'RATING'; // RATING: 1-5
}

// Completed checklist response
interface ChecklistResponse {
  checklistItemId: string;
  value: boolean | string | number; // depends on inputType
  notes: string | null;
}

// Asset upload (photo/document)
interface AssetUploadState {
  localId: string;         // client-generated UUID for tracking
  file: File;
  previewUrl: string;      // object URL for preview
  uploadStatus: 'PENDING' | 'UPLOADING' | 'DONE' | 'ERROR';
  progress: number;        // 0–100
  remoteUrl: string | null; // S3 URL after successful upload
  assetId: string | null;   // backend asset ID after upload
  errorMessage: string | null;
}

// Start inspection payload (POST /v1/inspector/appointments/:id/start)
interface StartInspectionPayload {
  latitude: number;
  longitude: number;
  startedAt: string;       // ISO 8601 – client-side timestamp
}

// Start response
interface StartInspectionResponse {
  appointmentId: string;
  status: 'SCHEDULED';     // still SCHEDULED until finish
  startedAt: string;
  checklistTemplate: ChecklistItem[];
}

// Finish inspection payload (POST /v1/inspector/appointments/:id/finish)
interface FinishInspectionPayload {
  latitude: number;
  longitude: number;
  finishedAt: string;        // ISO 8601
  checklist: ChecklistResponse[];
  notes: string;
  assetIds: string[];        // IDs of uploaded assets
}

// Finish response
interface FinishInspectionResponse {
  appointmentId: string;
  status: 'DONE';
}

// Asset presigned URL request
interface AssetPresignedUrlRequest {
  appointmentId: string;
  filename: string;
  contentType: string;   // "image/jpeg", "image/png", "application/pdf"
}

// Asset presigned URL response
interface AssetPresignedUrlResponse {
  assetId: string;
  uploadUrl: string;     // presigned S3 PUT URL
  expiresAt: string;     // ISO 8601
}

// Offline action queue item
interface QueuedAction {
  id: string;            // client-generated UUID
  type: 'START' | 'FINISH';
  appointmentId: string;
  payload: StartInspectionPayload | FinishInspectionPayload;
  queuedAt: string;
  retryCount: number;
  lastError: string | null;
}

// Local execution state (persisted to IndexedDB)
interface LocalExecutionState {
  appointmentId: string;
  phase: ExecutionPhase;
  startLocation: CapturedLocation | null;
  startedAt: string | null;
  checklistTemplate: ChecklistItem[];
  checklistResponses: ChecklistResponse[];
  uploadedAssets: AssetUploadState[];
  notes: string;
  lastSavedAt: string;   // ISO 8601 – for staleness detection
}
```

---

## 4. Screen: Execution (`/execution/:appointmentId`)

**Layout template:** `PwaFullScreenLayout` — full-screen, no bottom nav bar during execution.

**Top bar:**
- Back button (with warning modal if in-progress)
- Property address (truncated)
- Appointment time slot

---

### Phase 1: PRE_START

**Goal:** Capture inspector's geolocation and confirm they're at the property.

**Component:** `PreStartPanel`

**Steps displayed:**

1. **Geolocation step:**
   - Automatically requests `navigator.geolocation.getCurrentPosition()` on mount
   - Loading state: "Getting your location..." with spinning icon
   - Success: shows "Location acquired" with accuracy badge (e.g. "±12m") and a small map thumbnail (Mapbox static)
   - Error states:
     - Permission denied: "Location access denied. Please enable location in your browser settings." + retry button
     - Unavailable: "Location unavailable. Please check your device GPS." + retry button
     - Timeout (>10s): "Getting location took too long. Retry?" + retry button

2. **Address confirmation:**
   - Shows property address prominently
   - Question: "Are you at this property?"
   - "Yes, I'm here" button (primary, green)
   - If not at property: "No" link → shows warning "Please make sure you are at the correct property before starting."

3. **Start Inspection button:**
   - Enabled only when: geolocation acquired + address confirmed
   - Label: "Start Inspection"
   - On tap: POST `/v1/inspector/appointments/:id/start` with captured location
   - Offline handling: if offline, queue the action and proceed to IN_PROGRESS phase anyway

**Geolocation accuracy UI:**

| Accuracy | Badge color | Label |
|---|---|---|
| < 20m | green | "Good (±Xm)" |
| 20–50m | yellow | "Fair (±Xm)" |
| > 50m | orange | "Approximate (±Xm)" |

---

### Phase 2: IN_PROGRESS

**Goal:** Inspector completes checklist, captures photos, adds notes.

**Component:** `InProgressPanel`

**Layout:** Tabbed or sectioned scroll view:
1. **Checklist** — grouped by category
2. **Photos** — photo capture and gallery
3. **Notes** — text field

**Progress indicator:** Top of panel shows: "X of Y checklist items completed" with a progress bar.

---

#### Checklist Section

**Component:** `ChecklistSection`

```typescript
interface ChecklistSectionProps {
  items: ChecklistItem[];
  responses: ChecklistResponse[];
  onChange: (responses: ChecklistResponse[]) => void;
}
```

Items grouped by `category` (e.g., "Exterior", "Living Areas", "Kitchen", etc.).

**Input types:**

| inputType | UI Component |
|---|---|
| BOOLEAN | Large toggle switch (YES / NO) |
| TEXT | Text input (multiline) |
| RATING | 5-star tap selector |

Each item has:
- Item label (bold)
- Required indicator (red asterisk if `required === true`)
- Input component
- Optional "Add note" link → expands a textarea below the item
- Completed items: checkmark icon in category header counter

**Required item validation:** "Finish" button disabled until all `required === true` items have a non-empty response.

---

#### Photos Section

**Component:** `PhotosSection`

```typescript
interface PhotosSectionProps {
  appointmentId: string;
  assets: AssetUploadState[];
  onAssetsChange: (assets: AssetUploadState[]) => void;
}
```

**Capture options:**
1. "Take Photo" — triggers `<input type="file" accept="image/*" capture="environment">` (rear camera)
2. "Choose from Gallery" — triggers `<input type="file" accept="image/*">` (no capture attribute)

**Per-photo card:**
```
┌──────────────┐
│  [thumbnail] │  ← 100×100px preview
│  [progress]  │  ← upload progress bar (during upload)
│  [status]    │  ← Done / Error / Uploading
│  [delete]    │  ← trash icon (allows removing)
└──────────────┘
```

**Upload flow:**
1. User picks file → create `AssetUploadState` with `status: 'PENDING'`
2. `useAssetUpload` hook fires:
   a. POST `/v1/assets/presign` → get `uploadUrl` + `assetId`
   b. PUT to `uploadUrl` (S3 presigned URL) with file binary
   c. Update `progress` as upload proceeds (XHR with `onprogress`)
   d. On success: set `status: 'DONE'`, save `remoteUrl` + `assetId`
   e. On error: set `status: 'ERROR'`, show retry button

**Offline upload behavior:**
- If offline when user adds a photo: save to IndexedDB as binary blob
- When back online: auto-trigger upload for all PENDING assets
- Show banner: "X photos waiting to upload. Connect to upload."

**Limits:**
- Maximum 30 photos per inspection
- Maximum file size: 10 MB per photo
- Accepted MIME types: `image/jpeg`, `image/png`, `image/heic`
- HEIC files are converted client-side to JPEG before upload (using `heic2any` library or equivalent)

**Error states per photo:**
- Upload failed (network): "Upload failed. Tap to retry."
- File too large: "Photo exceeds 10MB limit."
- Invalid format: "Unsupported format. Use JPG or PNG."

---

#### Notes Section

**Component:** `NotesSection`

```typescript
interface NotesSectionProps {
  value: string;
  onChange: (notes: string) => void;
}
```

- Large `<textarea>` with label "Inspection Notes"
- Placeholder: "Add any observations, issues, or comments about the property..."
- Max 2000 chars; character counter shown at 1800+
- Auto-saved to `LocalExecutionState` on every keystroke (debounced 1s)

---

#### Finish Button

Fixed at bottom of screen (sticky bottom panel):

```typescript
interface FinishButtonPanelProps {
  isReady: boolean;  // all required checklist items complete + no pending uploads
  onFinish: () => void;
}
```

**Readiness rules:**
- All `required === true` checklist items have a response
- No assets in `status: 'UPLOADING'` state (wait for all uploads to complete)
- Assets in `status: 'ERROR'` are allowed (inspector can proceed without failed photos, with a warning)

**If assets still uploading:** button shows "Uploading photos... X remaining" and is disabled.

**If required checklist items incomplete:** button shows "X required items remaining" and is disabled.

---

### Phase 3: FINISHING

**Goal:** Capture final geolocation before submitting.

**Component:** `FinishingPanel`

Same geolocation capture UI as PRE_START phase.

- Shows "Capturing your final location..."
- Once acquired: "Final location captured. Ready to submit."
- "Submit Inspection" button: primary green, full-width

**Summary shown before submit:**
- "X checklist items completed"
- "X photos attached"
- "Final notes: [first 100 chars]..."

---

### Phase 4: SUBMITTING

**Component:** `SubmittingPanel`

- Full-screen overlay with centered spinner
- "Submitting inspection report..."
- Cannot be dismissed (prevents double-submission)

**On success:** Transition to DONE phase.
**On error:** Transition to ERROR phase with retry option.

---

### Phase 5: DONE

**Component:** `DonePanel`

- Large checkmark icon (animated)
- "Inspection Complete!"
- Property address
- "Back to Schedule" button → navigate to `/schedule`

---

### Phase 6: ERROR

**Component:** `ErrorPanel`

- Error icon
- Message: varies by error type (see Section 7)
- "Retry Submission" button (if submittable)
- "Save & Exit" button (saves local state, navigates to schedule; can resume later via same URL)

---

## 5. Components

### `GeoLocationCapture`

```typescript
interface GeoLocationCaptureProps {
  onCapture: (location: CapturedLocation) => void;
  onError: (errorType: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT') => void;
  isCapturing: boolean;
}
```

Internal implementation:
```typescript
function captureGeolocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject('UNAVAILABLE');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject('PERMISSION_DENIED');
        else if (error.code === error.POSITION_UNAVAILABLE) reject('UNAVAILABLE');
        else reject('TIMEOUT');
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }
    );
  });
}
```

---

### `ChecklistItem`

```typescript
interface ChecklistItemProps {
  item: ChecklistItem;
  response: ChecklistResponse | undefined;
  onChange: (response: ChecklistResponse) => void;
}
```

---

### `AssetThumbnail`

```typescript
interface AssetThumbnailProps {
  asset: AssetUploadState;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}
```

---

### `ProgressBar`

```typescript
interface ProgressBarProps {
  completed: number;
  total: number;
  label?: string; // e.g. "Checklist"
  color?: 'blue' | 'green';
}
```

---

## 6. API Integration

### Endpoints

```typescript
// Start inspection
POST /v1/inspector/appointments/:id/start
Headers: { 'Idempotency-Key': string }
Body: StartInspectionPayload
Response: StartInspectionResponse

// Finish inspection
POST /v1/inspector/appointments/:id/finish
Headers: { 'Idempotency-Key': string }
Body: FinishInspectionPayload
Response: FinishInspectionResponse

// Get presigned upload URL
POST /v1/assets/presign
Body: AssetPresignedUrlRequest
Response: AssetPresignedUrlResponse

// Direct S3 upload (not via app API)
PUT {presignedUrl}
Body: File binary
Headers: { 'Content-Type': file.type }
Response: 200 (no body)
```

### React Query / Mutation Hooks

```typescript
// Start inspection mutation
function useStartInspection(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StartInspectionPayload) =>
      inspectorApi.startInspection(appointmentId, payload, generateIdempotencyKey()),
    onSuccess: (data) => {
      // Update checklist template in local state
      saveLocalExecutionState(appointmentId, {
        phase: 'IN_PROGRESS',
        startedAt: data.startedAt,
        checklistTemplate: data.checklistTemplate,
      });
    },
    onError: (error, variables, context) => {
      // If network error, transition to IN_PROGRESS anyway (will sync later)
      if (isNetworkError(error)) {
        queueAction({
          type: 'START',
          appointmentId,
          payload: variables,
        });
        transitionPhase('IN_PROGRESS');
      }
    },
  });
}

// Finish inspection mutation
function useFinishInspection(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FinishInspectionPayload) =>
      inspectorApi.finishInspection(appointmentId, payload, generateIdempotencyKey()),
    onSuccess: () => {
      clearLocalExecutionState(appointmentId);
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'appointment', appointmentId] });
    },
    onError: (error, variables) => {
      if (isNetworkError(error)) {
        queueAction({ type: 'FINISH', appointmentId, payload: variables });
        transitionPhase('DONE'); // Optimistic: show done, sync when online
      }
    },
  });
}

// Asset upload hook
function useAssetUpload() {
  return useMutation({
    mutationFn: async ({ appointmentId, file }: { appointmentId: string; file: File }) => {
      // Step 1: Get presigned URL
      const { uploadUrl, assetId } = await assetsApi.getPresignedUrl({
        appointmentId,
        filename: file.name,
        contentType: file.type,
      });

      // Step 2: Upload to S3 via XHR (for progress tracking)
      await uploadFileToS3(uploadUrl, file, (progress) => {
        updateAssetProgress(assetId, progress);
      });

      return { assetId };
    },
  });
}
```

### IndexedDB Local State

```typescript
// Database: 'properfy-pwa', version 1
// Store: 'execution-states' (key: appointmentId)
// Store: 'queued-actions' (key: action.id)
// Store: 'pending-assets' (key: asset.localId) — for offline photo storage

async function saveLocalExecutionState(
  appointmentId: string,
  update: Partial<LocalExecutionState>
): Promise<void> {
  const db = await openDB();
  const existing = await db.get('execution-states', appointmentId) ?? {};
  await db.put('execution-states', {
    ...existing,
    ...update,
    appointmentId,
    lastSavedAt: new Date().toISOString(),
  }, appointmentId);
}

async function getLocalExecutionState(
  appointmentId: string
): Promise<LocalExecutionState | null> {
  const db = await openDB();
  return db.get('execution-states', appointmentId) ?? null;
}

async function clearLocalExecutionState(appointmentId: string): Promise<void> {
  const db = await openDB();
  await db.delete('execution-states', appointmentId);
}
```

### Offline Action Queue Sync

```typescript
// Runs when navigator.onLine changes to true
async function syncOfflineQueue(): Promise<void> {
  const db = await openDB();
  const actions = await db.getAll('queued-actions');

  for (const action of actions) {
    try {
      if (action.type === 'START') {
        await inspectorApi.startInspection(
          action.appointmentId,
          action.payload as StartInspectionPayload,
          generateIdempotencyKey()
        );
      } else if (action.type === 'FINISH') {
        await inspectorApi.finishInspection(
          action.appointmentId,
          action.payload as FinishInspectionPayload,
          generateIdempotencyKey()
        );
      }
      await db.delete('queued-actions', action.id);
    } catch (err) {
      // Update retry count; if > 3 retries, flag for manual intervention
      await db.put('queued-actions', {
        ...action,
        retryCount: action.retryCount + 1,
        lastError: String(err),
      }, action.id);
    }
  }
}
```

---

## 7. Business Rules in Frontend

### Idempotency

- Both START and FINISH calls include an `Idempotency-Key` header
- The key is generated once per execution session and stored in `LocalExecutionState`
- If the inspector retries (e.g., taps "Retry Submission"), the SAME idempotency key is reused to prevent double-submission

```typescript
function getOrCreateIdempotencyKey(appointmentId: string, action: 'start' | 'finish'): string {
  const storageKey = `idempotency-${appointmentId}-${action}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}
```

### Geolocation Requirement

- START requires geolocation; if geolocation permanently unavailable (permission denied), show error: "Location access is required to start an inspection. Please enable location access in your device settings and reload."
- A "Location Unavailable" bypass is NOT allowed in the frontend — location is mandatory per business rules
- FINISH also requires geolocation; same error handling

### Checklist Completeness

- Items with `required: true` must be answered before the "Finish" button activates
- Items with `required: false` can be left unanswered
- BOOLEAN items: toggling either YES or NO counts as answered
- TEXT items: any non-empty string counts as answered
- RATING items: selecting any value 1–5 counts as answered

### Photo Upload Failures

- If 1+ photos are in `ERROR` state and the inspector tries to finish:
  - Show a confirmation dialog: "X photos failed to upload. Do you want to proceed without them? They will not be included in the report."
  - If inspector confirms: proceed to FINISH without those asset IDs
  - If inspector cancels: stay in IN_PROGRESS to retry uploads

### Offline Optimistic Behavior

- If START fails with network error: proceed to IN_PROGRESS optimistically; queue START action
- If FINISH fails with network error: show DONE optimistically; queue FINISH action; show persistent banner "Inspection queued for upload"
- When online again: auto-sync the queue
- The inspector is NOT blocked from proceeding by network errors

### Resume after Exit

- If inspector exits mid-inspection (navigates away) and returns to `/execution/:appointmentId`:
  - Load `LocalExecutionState` from IndexedDB
  - Resume from the saved phase (IN_PROGRESS or FINISHING)
  - All checklist responses and photos are restored
  - Show banner: "Resuming your inspection in progress."

### S3 Upload Expiry

- Presigned URLs expire (typically 15 minutes)
- If an upload is attempted after the presigned URL expires (HTTP 403 from S3):
  - Automatically re-fetch a new presigned URL and retry
  - Max 1 automatic retry; if second attempt fails, mark asset as ERROR

---

## 8. UX Rules

### Navigation Flows

- Entry: from `/schedule/:appointmentId` via "Start Inspection" button
- Exit: back arrow → warning modal if in-progress
- Completion: after DONE phase → "Back to Schedule" → `/schedule`

### Destructive Confirmations

- Leaving during IN_PROGRESS: modal "Leave inspection? Your progress is saved and you can resume later." — "Leave" (gray) + "Stay" (primary)
- Skipping failed photos: modal "X photos failed. Continue without them?" — "Skip Photos" (orange) + "Retry Upload" (primary)

### Auto-save

- Checklist responses auto-saved to IndexedDB every 2 seconds when changed
- Notes auto-saved every 1 second (debounced)
- User never needs to manually save — the state persists across app close/reopen

### Feedback

- START success: phase transitions immediately to IN_PROGRESS (no toast needed)
- FINISH success: DONE panel with animation
- Upload progress: per-photo progress bar
- Offline queue sync: subtle banner "Syncing X pending actions..." then "All synced" on completion

### Responsive Behavior

- Full-screen on all mobile sizes
- Fixed bottom bar for the "Finish" button (always reachable)
- Photos grid: 3 columns on most phones; 4 columns on tablets

### Accessibility for Field Use

- All buttons minimum 48px height
- High contrast text (WCAG AA minimum)
- Checklist item toggles are large (full-width touch area)
- Rating stars are 36px each with spacing for accurate tapping with gloves

### Performance

- Photos are compressed client-side before upload: max 1920px on longest side, JPEG quality 85%
- Thumbnail previews generated from object URLs (no server round-trip)
- Checklist list virtualized if > 50 items (using `react-virtual` or similar)

### Error Messages

| Error scenario | Message |
|---|---|
| Geolocation permission denied | "Location access denied. Please enable location in your device settings and reload the page." |
| Geolocation timeout | "Couldn't get your location. Retry?" |
| Start API error (non-network) | "Failed to start inspection. Please try again." |
| Finish API error (non-network) | "Failed to submit inspection. Please try again." |
| S3 upload 403 (expired URL) | Auto-retry silently; if fails: "Photo upload expired. Retrying..." |
| S3 upload 500 | "Upload failed. Check your connection and tap to retry." |
| File too large | "This photo is too large (max 10MB). Please choose a smaller photo." |
| Invalid MIME type | "Unsupported file type. Please use JPEG or PNG." |
