# Tenant Portal – Web Feature Spec

> Portal: Tenant Portal (apps/web — separate entry or route namespace)
> Last updated: 2026-03-15

---

## 1. Overview

The Tenant Portal is the public-facing interface accessed by property tenants via a unique, time-limited link sent by SMS and/or email. There is NO traditional authentication — access is gated entirely by the token embedded in the URL. Tenants can confirm their availability, report unavailability, or request a reschedule for an upcoming inspection.

**Portal:** Tenant Portal (TNT role, token-based)
**No sidebar, no main nav, no login.** This is a standalone experience.

**Key deadline rule:** Actions are available until 7:00 PM on the day before the scheduled inspection. After that, the portal becomes read-only.

**Pages/screens:**
1. Tenant Portal Main (`/tenant-portal/:token`) — single page, all actions here

---

## 2. Pages & Routes

| Path | Component | Description |
|---|---|---|
| `/tenant-portal/:token` | `TenantPortalPage` | Token-gated portal — all tenant interactions |

This route does NOT use `MainLayout`. It uses `TenantPortalLayout` — a minimal, brand-neutral layout with just the Properfy (or agency) logo, the content area, and a footer.

```tsx
// No AuthGuard — public route, token validated server-side
<Route path="/tenant-portal/:token" element={<TenantPortalPage />} />
```

**Error routes (within same layout):**
- Token not found / invalid → `TenantPortalInvalidPage`
- Token expired → `TenantPortalExpiredPage` (read-only view, different banner)
- Appointment already cancelled/rejected → `TenantPortalUnavailablePage`

---

## 3. TypeScript Interfaces

```typescript
// Tenant portal token data (returned by GET /v1/tenant-portal/:token)
interface TenantPortalData {
  token: string;
  isValid: boolean;
  isExpired: boolean;            // true after 7PM day before inspection
  appointment: TenantPortalAppointment;
  tenantContact: TenantPortalContact;
  existingResponse: TenantPortalResponse | null;
}

// Appointment summary for tenant view (minimal, no internal IDs exposed)
interface TenantPortalAppointment {
  id: string;
  scheduledDate: string;          // "YYYY-MM-DD"
  timeSlot: string;               // "HH:MM-HH:MM" e.g. "09:00-11:00"
  serviceType: TenantServiceTypeLabel; // human-readable label
  property: {
    streetAddress: string;
    addressLine2: string | null;
    suburb: string;
    postcode: string;
    state: string;
  };
  agencyName: string;             // tenant/agency display name
  agencyLogoUrl: string | null;
  agencyPhone: string | null;
  confirmationDeadline: string;   // ISO 8601 — 7PM day before inspection
  status: TenantPortalAppointmentStatus;
}

// Simplified status for tenant view
type TenantPortalAppointmentStatus =
  | 'SCHEDULED'
  | 'CANCELLED'
  | 'DONE';

// Human-readable service type labels for tenant
type TenantServiceTypeLabel =
  | 'Routine Inspection'
  | 'Ingoing Inspection'
  | 'Outgoing Inspection'
  | 'Vacate Inspection'
  | 'Maintenance Inspection';

// Tenant contact (editable fields)
interface TenantPortalContact {
  name: string;
  email: string | null;
  phone: string | null;
}

// Existing response (if tenant already responded)
interface TenantPortalResponse {
  responseType: TenantResponseType;
  isHome: boolean | null;
  unavailableDays: string[] | null;       // "YYYY-MM-DD" array
  unavailableHours: string | null;        // free text e.g. "9am-11am not available"
  notes: string | null;
  respondedAt: string;                    // ISO 8601
}

// Response types
type TenantResponseType = 'CONFIRMED' | 'UNAVAILABLE' | 'RESCHEDULE_REQUEST';

// Confirm payload
interface TenantConfirmPayload {
  isHome: boolean;
  unavailableDays?: string[];
  unavailableHours?: string;
  notes?: string;
}

// Report unavailability payload
interface TenantUnavailablePayload {
  unavailableDays?: string[];
  unavailableHours?: string;
  notes?: string;
}

// Reschedule request payload
interface TenantReschedulePayload {
  preferredDate: string;          // "YYYY-MM-DD", min: today+1, max: original+30days
  preferredTimeSlot: string;      // "HH:MM-HH:MM"
  unavailableDays?: string[];
  unavailableHours?: string;
  restrictions?: string;
  notes?: string;
}

// Contact update payload
interface TenantContactUpdatePayload {
  email?: string;
  phone?: string;
}

// Available time slots (for reschedule)
interface AvailableTimeSlotsResponse {
  date: string;
  slots: string[];  // ["08:00-10:00", "10:00-12:00", ...]
}
```

---

## 4. Screen: Tenant Portal Main (`/tenant-portal/:token`)

**Layout template:** `TenantPortalLayout`
- Logo: agency logo (from `agencyLogoUrl`) OR Properfy default logo
- No sidebar, no top navigation bar
- Footer: agency phone number (if set) + "Powered by Properfy" text

**Page loading behavior:**
1. On mount, call `GET /v1/tenant-portal/:token` to fetch portal data
2. While loading: full-page centered spinner
3. If `isValid === false` OR HTTP 404: render `TenantPortalInvalidPage`
4. If `isExpired === true`: render `TenantPortalExpiredPage` (read-only summary)
5. If `appointment.status === 'CANCELLED'`: render `TenantPortalUnavailablePage`
6. Otherwise: render the interactive portal page

**Page structure (interactive mode):**

```
┌─────────────────────────────────────────┐
│ [Agency Logo]                           │
│                                         │
│ SECTION 1: Appointment Summary Card     │
│ SECTION 2: Contact Info (editable)      │
│ SECTION 3: Response Section             │
│   ├─ [If no prior response] Action Btns │
│   └─ [If prior response] Response Card  │
│                                         │
│ [Footer]                                │
└─────────────────────────────────────────┘
```

---

### Section 1: Appointment Summary Card

**Component:** `AppointmentSummaryCard`

Displays:
- Service type label (large, prominent): e.g. "Routine Inspection"
- Property full address (street, suburb, state, postcode)
- Date: formatted as "Wednesday, 15 April 2026"
- Time slot: "9:00 AM – 11:00 AM" (formatted from "09:00-11:00")
- Deadline notice (when token is valid, before deadline): "Please respond by [deadline date+time]"
- Agency name

**Styling:** Card with left accent border in agency primary color (fallback: brand blue). Clean, large typography optimized for mobile reading.

---

### Section 2: Contact Info

**Component:** `TenantContactSection`

Displays tenant name, email, phone. Email and phone are editable inline.

**Edit behavior:**
- Each field has a pencil icon that toggles into an inline edit input
- On blur or on pressing "Save", fires `PATCH /v1/tenant-portal/:token/contact`
- Success: field reverts to display mode, brief green checkmark animation
- Error: field shows red border + error message "Failed to update. Please try again."
- Validation:
  - Email: valid email format
  - Phone: Australian phone format `^(\+61|0)[2-9]\d{8}$`

**States:**
- Viewing: shows current values with edit icon
- Editing: input field + "Save" / "Cancel" icons
- Saving: input disabled, spinner

---

### Section 3: Response Section

#### 3A: No prior response (or `existingResponse === null`)

Shows three action buttons:
1. "I'll be home" / "Confirm Attendance" — green primary button
2. "I'm not available" — orange secondary button
3. "Request a Reschedule" — blue outlined button

Each button opens its respective modal/expansion panel.

---

#### 3B: Prior response exists

Shows a `ResponseConfirmationCard`:
- Green/orange/blue header based on `responseType`
- "You responded: [response type label] on [respondedAt formatted]"
- Summary of their response (isHome, notes, etc.)
- "Change my response" link → collapses/replaces with the three action buttons again

---

### Confirm Flow — `ConfirmModal`

Triggered by "Confirm Attendance" button.

```typescript
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  scheduledDate: string;
  onSuccess: (response: TenantPortalResponse) => void;
}
```

**Modal content:**

**Step 1 (single-step form):**

| Field | Type | Required | Notes |
|---|---|---|---|
| Will you be home? | Toggle (Yes/No) | Yes | Default: Yes |
| Unavailable days | Multi-date picker | No | Optional – specific days tenant is NOT available around the window |
| Unavailable hours | Text input | No | "e.g. 9–11am not available" |
| Additional notes | Textarea | No | Max 500 chars |

**Submit button:** "Confirm Inspection"
**On success:** Modal closes, `ResponseConfirmationCard` appears (green), toast "Thank you for confirming!"

**POST:** `POST /v1/tenant-portal/:token/confirm` with `TenantConfirmPayload`

---

### Unavailability Flow — `UnavailableModal`

Triggered by "I'm not available" button.

```typescript
interface UnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: (response: TenantPortalResponse) => void;
}
```

**Form fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Unavailable days | Multi-date picker | No | Specific days they cannot accommodate |
| Unavailable hours | Text input | No | "e.g. Before 10am" |
| Additional notes | Textarea | No | Max 500 chars |

**Info banner at top of modal:** "Reporting unavailability will notify your property manager. They will be in touch to arrange a suitable time."

**Submit button:** "Submit Unavailability"

**POST:** `POST /v1/tenant-portal/:token/unavailable` with `TenantUnavailablePayload`

**On success:** Modal closes, `ResponseConfirmationCard` (orange) appears, toast "Your property manager has been notified."

---

### Reschedule Flow — `RescheduleModal`

Triggered by "Request a Reschedule" button.

```typescript
interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  originalDate: string;
  onSuccess: (response: TenantPortalResponse) => void;
}
```

**Form fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Preferred Date | Date picker | Yes | Min: today+1; Max: originalDate+30 days |
| Preferred Time Slot | Select from available slots | Yes | Loaded via `GET /v1/tenant-portal/:token/available-slots?date=` |
| Unavailable days | Multi-date picker | No | Days around the window they cannot do |
| Unavailable hours | Text input | No | Free text |
| Restrictions | Textarea | No | e.g. "No access before 10am", max 500 chars |
| Additional notes | Textarea | No | Max 500 chars |

**Date picker behavior:**
- When a new date is selected, load available time slots:
  ```
  GET /v1/tenant-portal/:token/available-slots?date=YYYY-MM-DD
  → AvailableTimeSlotsResponse
  ```
- While loading slots: time slot select shows "Loading available times..."
- If no slots available for date: "No available time slots for this date. Please choose another date."

**Info banner:** "Rescheduling requests are subject to approval by your property manager. They will contact you to confirm."

**Submit button:** "Submit Reschedule Request"

**POST:** `POST /v1/tenant-portal/:token/reschedule` with `TenantReschedulePayload`

**On success:** Modal closes, `ResponseConfirmationCard` (blue) appears, toast "Your reschedule request has been sent."

---

### Read-only mode (expired token)

**Component:** `TenantPortalExpiredPage`

Same layout as main page but:
- All action buttons are hidden
- Yellow/amber info banner at top: "The response deadline for this inspection has passed. If you need to make changes, please contact your property manager."
- Shows appointment summary and any existing response (read-only)
- Shows agency phone number prominently if set

---

### Invalid/Not Found mode

**Component:** `TenantPortalInvalidPage`

Content:
- Icon: warning triangle
- Heading: "This link is no longer valid"
- Body: "The inspection confirmation link you followed may have expired or is incorrect. Please check your email or SMS for the correct link, or contact your property manager."
- No retry button (link is invalid)

---

### Appointment Cancelled mode

**Component:** `TenantPortalUnavailablePage`

Content:
- Icon: calendar with X
- Heading: "This inspection has been cancelled"
- Body: "The inspection scheduled for [date] at [address] has been cancelled. Please contact your property manager if you have any questions."
- Agency phone prominently displayed if set

---

## 5. Components

### `TenantPortalLayout`

```typescript
interface TenantPortalLayoutProps {
  agencyLogoUrl: string | null;
  agencyName: string;
  agencyPhone: string | null;
  children: React.ReactNode;
}
```

Renders: centered single-column layout, max-width 640px, comfortable padding. Logo centered at top (64px height max). Footer sticks to bottom on short pages.

---

### `AppointmentSummaryCard`

```typescript
interface AppointmentSummaryCardProps {
  appointment: TenantPortalAppointment;
  isExpired: boolean;
}
```

---

### `TenantContactSection`

```typescript
interface TenantContactSectionProps {
  contact: TenantPortalContact;
  token: string;
  isExpired: boolean;         // disables editing when expired
  onUpdate: (updated: TenantPortalContact) => void;
}
```

---

### `ResponseConfirmationCard`

```typescript
interface ResponseConfirmationCardProps {
  response: TenantPortalResponse;
  onChangeResponse: () => void; // shown unless expired
  isExpired: boolean;
}
```

**Visual variants:**
- CONFIRMED: green left border, checkmark icon, "Inspection Confirmed"
- UNAVAILABLE: orange left border, calendar-x icon, "Unavailability Reported"
- RESCHEDULE_REQUEST: blue left border, calendar-clock icon, "Reschedule Requested"

---

### `MultiDatePicker`

```typescript
interface MultiDatePickerProps {
  label: string;
  value: string[];          // "YYYY-MM-DD" array
  onChange: (dates: string[]) => void;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}
```

Simple calendar where multiple dates can be toggled on/off. Selected dates shown as chips below. Optimized for mobile (large tap targets).

---

## 6. API Integration

### Endpoints

```typescript
// Load portal data
GET /v1/tenant-portal/:token
→ TenantPortalData

// Update contact info
PATCH /v1/tenant-portal/:token/contact
Body: TenantContactUpdatePayload
→ TenantPortalContact

// Submit confirmation
POST /v1/tenant-portal/:token/confirm
Body: TenantConfirmPayload
→ TenantPortalResponse

// Report unavailability
POST /v1/tenant-portal/:token/unavailable
Body: TenantUnavailablePayload
→ TenantPortalResponse

// Submit reschedule request
POST /v1/tenant-portal/:token/reschedule
Body: TenantReschedulePayload
→ TenantPortalResponse

// Available time slots for reschedule date picker
GET /v1/tenant-portal/:token/available-slots?date=YYYY-MM-DD
→ AvailableTimeSlotsResponse
```

### React Query Hooks

```typescript
// Load portal data (primary query for the page)
function useTenantPortal(token: string) {
  return useQuery({
    queryKey: ['tenant-portal', token],
    queryFn: () => tenantPortalApi.getPortalData(token),
    enabled: !!token,
    retry: 1,  // only retry once; invalid tokens should fail fast
    staleTime: 60_000,
  });
}

// Available time slots (for reschedule date selection)
function useAvailableTimeSlots(token: string, date: string | null) {
  return useQuery({
    queryKey: ['tenant-portal', token, 'slots', date],
    queryFn: () => tenantPortalApi.getAvailableSlots(token, date!),
    enabled: !!date,
    staleTime: 120_000,
  });
}

// Confirm mutation
function useTenantConfirm(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TenantConfirmPayload) =>
      tenantPortalApi.confirm(token, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ['tenant-portal', token],
        (old: TenantPortalData) => ({ ...old, existingResponse: response })
      );
    },
  });
}

// Unavailable mutation
function useTenantUnavailable(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TenantUnavailablePayload) =>
      tenantPortalApi.reportUnavailable(token, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ['tenant-portal', token],
        (old: TenantPortalData) => ({ ...old, existingResponse: response })
      );
    },
  });
}

// Reschedule mutation
function useTenantReschedule(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TenantReschedulePayload) =>
      tenantPortalApi.requestReschedule(token, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ['tenant-portal', token],
        (old: TenantPortalData) => ({ ...old, existingResponse: response })
      );
    },
  });
}

// Contact update mutation
function useTenantContactUpdate(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TenantContactUpdatePayload) =>
      tenantPortalApi.updateContact(token, payload),
    onSuccess: (contact) => {
      queryClient.setQueryData(
        ['tenant-portal', token],
        (old: TenantPortalData) => ({ ...old, tenantContact: contact })
      );
    },
  });
}
```

---

## 7. Business Rules in Frontend

### Token Validity and Deadline

- Token validity is determined server-side. The `isExpired` and `isValid` flags from the API response drive the UI mode.
- **Deadline:** 7:00 PM AEST on the day before the scheduled inspection. The `confirmationDeadline` ISO string returned by the API is the authoritative source.
- Frontend SHOULD display a countdown timer when less than 24 hours remain before the deadline:
  - "Respond within X hours Y minutes"
  - Updates every minute via `setInterval`
  - When countdown reaches 0, reload the portal data to get the updated `isExpired` state

### Response Re-submission

- Tenants CAN change their response before the deadline
- If `existingResponse` is set, show "Change my response" link that re-presents the three action buttons
- Submitting a new response overwrites the previous one (server-side idempotency)

### Contact Update Rules

- Tenants can update email and phone, but NOT their name (name is managed by the agency)
- Contact update is allowed even after the deadline (for read-only expired mode)
- Contact update is always available regardless of response status

### Reschedule Date Constraints

```typescript
// Minimum and maximum allowed reschedule dates
const minDate = addDays(new Date(), 1);  // tomorrow
const maxDate = addDays(parseISO(originalDate), 30);  // original date + 30 days

function isDateAllowed(date: Date): boolean {
  return isAfter(date, minDate) && isBefore(date, maxDate);
}
```

### Cancelled Appointment Handling

- If the appointment's status is CANCELLED or REJECTED (mapped to `TenantPortalAppointmentStatus`), the portal shows the cancellation page immediately without showing response options
- The tenant cannot interact with a cancelled appointment

### Service Type Labels

```typescript
const SERVICE_TYPE_LABELS: Record<string, TenantServiceTypeLabel> = {
  ROUTINE: 'Routine Inspection',
  INGOING: 'Ingoing Inspection',
  OUTGOING: 'Outgoing Inspection',
  VACATE: 'Vacate Inspection',
  MAINTENANCE: 'Maintenance Inspection',
};
```

---

## 8. UX Rules

### Mobile-First Design

- This portal is primarily accessed on mobile (via SMS link)
- Minimum tap target: 44×44px for all buttons
- Large font sizes: body text 16px, headings 24px+
- No hover-only states — all interactions must work via touch
- Modals should be full-screen bottom sheets on mobile (< 640px)

### Navigation Flows

- The portal is a single page — no internal navigation
- All modals slide up from the bottom (mobile) or appear centered (desktop)
- After successful action, modal closes and page scrolls to `ResponseConfirmationCard`

### Feedback and Accessibility

- All success states: checkmark animation + toast (top banner on mobile, top-right on desktop)
- All error states: red inline error near the relevant field
- Network error during action: "Something went wrong. Please try again." — retryable via button in modal
- Loading state in modal submit button: spinner + "Sending..."

### Deadline Countdown Display

- Shows in the appointment summary card when less than 24h remain
- Format: "Please respond in 4 hours 32 minutes" (amber text)
- When less than 1 hour: red text with urgency styling

### No Authentication UI

- No login, no password, no session
- The entire page is accessible purely via the `:token` URL parameter
- The page title: "[Agency Name] – Inspection Confirmation"
- Meta description: "Confirm or reschedule your property inspection."

### Retry on Network Error

- All action mutations have retry button in the error state of modals
- Contact update failures show inline retry (not a modal)

### After-Deadline Experience

- Shows the appointment summary and the tenant's last response (if any) in read-only format
- Agency phone number displayed in a large call-to-action card: "Need to make changes? Call us: [phone]"
- No action buttons
- No countdown (deadline already passed)

### Branding

- Agency logo displayed if `agencyLogoUrl` is not null
- Logo max height: 64px, max width: 200px, object-fit: contain
- Fallback to Properfy default logo if no agency logo
- Agency primary color is NOT applied (no theme color per agency in v1 — all use brand defaults)
