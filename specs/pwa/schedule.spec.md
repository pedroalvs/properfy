# Schedule – PWA Feature Spec

> App: Inspector Mobile App (apps/pwa)
> Last updated: 2026-03-15

---

## 1. Overview

The Schedule screen is the default home screen for inspectors when they open the PWA. It shows a day-by-day view of their upcoming appointments, letting them quickly see what's on for today or any upcoming day, check tenant confirmation status, review property details, and navigate to the execution flow when it's time to start an inspection.

**App:** Inspector PWA (apps/pwa)
**Auth:** JWT (email + password login; `INSP` role)
**Design:** Mobile-first, optimized for one-handed field use

**Pages/screens:**
1. Schedule Main (`/schedule`) — day selector + appointment list for selected day
2. Appointment Detail (`/schedule/:appointmentId`) — full detail for a single appointment

---

## 2. Pages & Routes

| Path | Component | Description |
|---|---|---|
| `/schedule` | `SchedulePage` | Default home; horizontal day selector + day's appointments |
| `/schedule/:appointmentId` | `AppointmentDetailPage` | Full appointment info + start inspection button |

Route access:

```tsx
// All PWA routes require inspector auth
<Route path="/schedule" element={<InspectorAuthGuard><SchedulePage /></InspectorAuthGuard>} />
<Route path="/schedule/:appointmentId" element={<InspectorAuthGuard><AppointmentDetailPage /></InspectorAuthGuard>} />
```

---

## 3. TypeScript Interfaces

```typescript
// Inspector appointment (schedule view)
interface InspectorAppointment {
  id: string;
  scheduledDate: string;              // "YYYY-MM-DD"
  timeSlot: string;                   // "HH:MM-HH:MM"
  timeSlotStart: string;              // "HH:MM" parsed
  timeSlotEnd: string;                // "HH:MM" parsed
  serviceType: InspectorServiceType;
  status: InspectorAppointmentStatus;
  tenantConfirmationStatus: TenantConfirmationStatus;
  property: InspectorProperty;
  tenantContact: InspectorTenantContact;
  keyRequired: boolean;
  keyLocation: string | null;
  meetingLocation: string | null;
  restrictions: string | null;
  notes: string | null;
  canStart: boolean;                   // computed server-side or locally: true on day-of within time window
}

// Inspector-facing service type labels
type InspectorServiceType =
  | 'ROUTINE'
  | 'INGOING'
  | 'OUTGOING'
  | 'VACATE'
  | 'MAINTENANCE';

// Status relevant to inspector
type InspectorAppointmentStatus =
  | 'SCHEDULED'
  | 'DONE'
  | 'CANCELLED';

// Tenant confirmation
type TenantConfirmationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'UNAVAILABLE'
  | 'NO_RESPONSE';

// Property for inspector view
interface InspectorProperty {
  id: string;
  propertyCode: string;
  streetAddress: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'RURAL';
}

// Tenant contact (read-only for inspector)
interface InspectorTenantContact {
  name: string;
  phone: string | null;      // tappable to call
  email: string | null;
}

// Schedule query params
interface ScheduleQueryParams {
  date: string;              // "YYYY-MM-DD"
}

// Schedule response
interface ScheduleResponse {
  date: string;
  appointments: InspectorAppointment[];
}

// Day summary (for the day selector strip)
interface DaySummary {
  date: string;              // "YYYY-MM-DD"
  appointmentCount: number;
  hasUrgent: boolean;        // any appointment with UNAVAILABLE confirmation status
}

// Schedule range (used to populate day selector)
interface ScheduleRangeResponse {
  days: DaySummary[];
}
```

---

## 4. Screens

### 4.1 Schedule Main (`/schedule`)

**Layout template:** `PwaLayout` — full-screen mobile layout with bottom navigation bar.

**Components:**
- `DaySelectorStrip` — horizontal scrollable row of day chips
- `AppointmentDayList` — list of appointment cards for selected day
- `AppointmentCard` — card component per appointment
- `TenantConfirmationBadge` — badge on card
- `EmptyDayState` — shown when no appointments for selected day

**Data consumed:**
```
GET /v1/inspector/schedule/range?from=YYYY-MM-DD&to=YYYY-MM-DD
→ ScheduleRangeResponse (used to populate day selector with counts)

GET /v1/inspector/schedule?date=YYYY-MM-DD
→ ScheduleResponse (appointments for selected day)
```

**React Query keys:**
```typescript
['inspector', 'schedule', 'range', { from, to }]
['inspector', 'schedule', 'day', selectedDate]
```

**Initial state:**
- Default selected date: today
- Range loaded: today + 14 days forward (covers two weeks)

**States:**

| State | UI behavior |
|---|---|
| Loading (day change) | Skeleton cards (3 cards) in the list area |
| Loading (range) | Day selector chips show as skeleton |
| Empty (no appointments today) | Empty state illustration + "No inspections scheduled for today" |
| Empty (future day) | "No inspections scheduled for [date]" |
| Error | Error banner at top of list + retry |
| Offline | Cached data shown with "You're offline – showing last synced data" banner |

**Day selector behavior:**
- Shows 14 days starting from today (today always first)
- Each day chip: day name (Mon/Tue/etc), date number, appointment count badge
- Days with appointments show a colored dot below the date
- Today's chip has a distinct border/highlight
- Selected chip: filled/active style
- Tapping a chip sets `selectedDate` state → re-fetches day schedule
- Chips with `hasUrgent=true` show an orange dot

---

#### Appointment Card

**Component:** `AppointmentCard`

```typescript
interface AppointmentCardProps {
  appointment: InspectorAppointment;
  isToday: boolean;
  onTap: () => void;
}
```

**Card layout:**
```
┌─────────────────────────────────────┐
│ [Time] 09:00 – 11:00    [Status]   │
│ [Service Type badge]                │
│ [Address line 1]                    │
│ [Suburb, State Postcode]            │
│ [Tenant Confirmation badge]         │
│                        [→ arrow]    │
└─────────────────────────────────────┘
```

**Color coding:**
- Card left border: blue for SCHEDULED, gray for DONE, red for CANCELLED
- Tapping anywhere on card navigates to `/schedule/:appointmentId`

**Tenant Confirmation Badge colors:**

| Status | Color |
|---|---|
| CONFIRMED | green badge |
| PENDING | yellow badge |
| UNAVAILABLE | orange badge |
| NO_RESPONSE | gray badge |

**Routine appointment T-1 rule (visibility):**
- For `serviceType === 'ROUTINE'` appointments, show a warning indicator if `tenantConfirmationStatus !== 'CONFIRMED'` and the appointment is today
- Warning: orange exclamation icon on card + tooltip "Tenant confirmation required for Routine inspections"
- The appointment still shows in the list (not hidden) — the warning is advisory

---

### 4.2 Appointment Detail (`/schedule/:appointmentId`)

**Layout template:** `PwaLayout` with back arrow at top left (→ `/schedule`).

**Components:**
- `PropertyAddressSection` — address + Google Maps link
- `TimeSlotSection` — date and time slot display
- `ServiceTypeBadge`
- `TenantContactSection` — name, phone (tap-to-call), email
- `KeyDetailsSection` — keyRequired, keyLocation, meetingLocation
- `RestrictionsSection` — restrictions text (collapsible if > 3 lines)
- `NotesSection` — notes text (collapsible)
- `TenantConfirmationBanner` — prominent banner for confirmation status
- `StartInspectionButton` — primary CTA

**Data consumed:**
```
GET /v1/inspector/appointments/:id
→ InspectorAppointment
```

**React Query key:**
```typescript
['inspector', 'appointment', appointmentId]
```

**States (page-level):**

| State | UI behavior |
|---|---|
| Loading | Full-page skeleton matching layout |
| Not found | "Appointment not found" + Back button |
| Error | Error card + retry |
| Offline (cached) | Cached data shown with "Offline – showing cached data" banner |

---

#### Property Address Section

Displays:
- Full address: `streetAddress`, `addressLine2 || ''`, `suburb`, `state`, `postcode`
- "Open in Maps" button → opens `https://maps.google.com/?q={streetAddress},{suburb},{state},{postcode}` in new tab (or native Maps app on mobile via deep link: `maps://...`)
- If latitude/longitude available: shows static map thumbnail (Mapbox static image API)
- Property type badge (Residential / Commercial / Industrial / Rural)
- Property code (small, gray)

---

#### Tenant Contact Section

Displays:
- Tenant name
- Phone number: displayed as tappable `tel:` link → initiates phone call on mobile
  - Format: display as "(04XX) XXX XXX" from raw format
  - Icon: green phone icon
- Email (display only, not tappable in this version)
- If no phone: "No phone number on file"

---

#### Key Details Section

Only shown if `keyRequired === true` OR `keyLocation` OR `meetingLocation` is set:
- "Key required: Yes/No"
- Key location: text or "Not specified"
- Meeting location: text or "Not specified"

---

#### Tenant Confirmation Banner

Prominent colored banner below the address section:

| Status | Color | Message |
|---|---|---|
| CONFIRMED | green | "Tenant confirmed attendance" |
| PENDING | yellow | "Tenant has not yet responded" |
| UNAVAILABLE | orange | "Tenant reported unavailability – contact your manager" |
| NO_RESPONSE | gray | "No tenant response received" |

---

#### Start Inspection Button

```typescript
interface StartInspectionButtonProps {
  appointment: InspectorAppointment;
  onStart: () => void;
}
```

**Visibility and availability rules:**
- ONLY shown when `appointment.status === 'SCHEDULED'`
- ONLY enabled on the scheduled date (today == `scheduledDate`)
- Time window: enabled 30 minutes before `timeSlotStart` and disabled after `timeSlotEnd` + 2 hours
  - If outside window: shown as disabled with tooltip "Available from [timeSlotStart - 30min]"
  - If after window: shown as disabled with tooltip "Time window has passed. Contact your manager."
- The `canStart` field from API provides the authoritative server-side check; frontend adds the local time check as a UX convenience (not a security gate)

**Button styles:**
- Active: large green primary button, full-width, "Start Inspection" label
- Disabled: grayed out, same size

**On tap:** Navigate to `/execution/:appointmentId`

---

## 5. Components

### `DaySelectorStrip`

```typescript
interface DaySelectorStripProps {
  days: DaySummary[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isLoading: boolean;
}
```

Horizontal `<div>` with `overflow-x: auto; white-space: nowrap`. Each day chip is a button.
Scroll position: on mount and on date change, auto-scrolls to keep selected chip visible.
No snap scrolling (user may drag freely).

**Day chip:**
```typescript
interface DayChipProps {
  summary: DaySummary;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
}
```

Chip layout:
```
Mon
15      ← date number (large)
● ●     ← dot per appointment (max 3 dots, then "+N")
```

---

### `AppointmentDayList`

```typescript
interface AppointmentDayListProps {
  appointments: InspectorAppointment[];
  isLoading: boolean;
  date: string;
}
```

Renders sorted by `timeSlotStart` ascending. No grouping — flat list.

---

### `ServiceTypeBadge`

```typescript
interface ServiceTypeBadgeProps {
  serviceType: InspectorServiceType;
  size?: 'sm' | 'md' | 'lg';
}
```

**Labels and colors:**

| Type | Label | Color |
|---|---|---|
| ROUTINE | Routine | blue |
| INGOING | Ingoing | green |
| OUTGOING | Outgoing | amber |
| VACATE | Vacate | purple |
| MAINTENANCE | Maintenance | gray |

---

### `TenantConfirmationBadge`

```typescript
interface TenantConfirmationBadgeProps {
  status: TenantConfirmationStatus;
  compact?: boolean; // for card usage (smaller, icon-only on very small screens)
}
```

---

## 6. API Integration

### Endpoints

```typescript
// Schedule range (for day selector)
GET /v1/inspector/schedule/range?from=YYYY-MM-DD&to=YYYY-MM-DD
Response: ScheduleRangeResponse

// Day schedule
GET /v1/inspector/schedule?date=YYYY-MM-DD
Response: ScheduleResponse

// Single appointment detail
GET /v1/inspector/appointments/:id
Response: InspectorAppointment
```

### React Query Hooks

```typescript
// Schedule range hook (14 days)
function useScheduleRange() {
  const from = format(new Date(), 'yyyy-MM-dd');
  const to = format(addDays(new Date(), 13), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['inspector', 'schedule', 'range', { from, to }],
    queryFn: () => inspectorApi.getScheduleRange(from, to),
    staleTime: 5 * 60_000,  // 5 minutes
    gcTime: 24 * 60 * 60_000, // 24 hours (keep for offline)
  });
}

// Day appointments hook
function useScheduleDay(date: string) {
  return useQuery({
    queryKey: ['inspector', 'schedule', 'day', date],
    queryFn: () => inspectorApi.getDaySchedule(date),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000, // keep for offline
    enabled: !!date,
  });
}

// Appointment detail hook
function useInspectorAppointment(id: string) {
  return useQuery({
    queryKey: ['inspector', 'appointment', id],
    queryFn: () => inspectorApi.getAppointment(id),
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000, // keep for offline
    enabled: !!id,
  });
}
```

### Offline Caching

The PWA uses TanStack Query's `gcTime` to keep data available when offline. Additionally, a service worker is configured to cache `GET /v1/inspector/*` API responses using a **stale-while-revalidate** strategy.

```typescript
// Service worker registration (apps/pwa/src/sw.ts via vite-plugin-pwa)
// Cache strategy for API: NetworkFirst with fallback to cache
// Cache name: 'inspector-api-v1'
// Max age: 24 hours

// Offline detection
function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}
```

---

## 7. Business Rules in Frontend

### T-1 Routine Inspection Rule

For `serviceType === 'ROUTINE'` inspections:
- If `tenantConfirmationStatus !== 'CONFIRMED'` AND the appointment is scheduled for today: show a warning indicator on the appointment card and detail page
- This is advisory only — the inspector can still start the inspection
- The rule is: "Routine inspections proceed only if tenant confirms OR if explicitly overridden by operator" — the override is handled backend-side; the frontend only shows the warning

### Start Button Time Window Logic

```typescript
function isWithinStartWindow(appointment: InspectorAppointment): boolean {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (appointment.scheduledDate !== today) return false;

  const now = new Date();
  const [startHour, startMin] = appointment.timeSlotStart.split(':').map(Number);
  const [endHour, endMin] = appointment.timeSlotEnd.split(':').map(Number);

  const windowOpen = new Date();
  windowOpen.setHours(startHour, startMin - 30, 0, 0); // 30 min before

  const windowClose = new Date();
  windowClose.setHours(endHour + 2, endMin, 0, 0); // 2 hours after slot end

  return isAfter(now, windowOpen) && isBefore(now, windowClose);
}
```

### Appointment Sort Order

Appointments in `AppointmentDayList` are sorted by `timeSlotStart` ascending (earliest first). If two appointments share the same start time, sort alphabetically by suburb.

### Status Filter

The schedule only shows appointments with `status === 'SCHEDULED'` for future dates and today. DONE and CANCELLED appointments are NOT shown in the schedule list (they're not included in the API response for `GET /v1/inspector/schedule`).

### Date Range

The day selector shows 14 days (today + 13 days forward). Past dates are not shown in the selector. The API only returns SCHEDULED appointments; past appointments that are DONE are not relevant to the schedule view.

---

## 8. UX Rules

### Navigation Flows

- Bottom nav bar tab: "Schedule" (calendar icon) — always navigates to `/schedule` (today selected)
- Tapping an appointment card → `/schedule/:appointmentId`
- Back from detail → browser back (or explicit back arrow at top) → `/schedule` with same selected date preserved (via navigation state or session storage)
- "Start Inspection" → `/execution/:appointmentId`

### Gestures and Interaction

- Pull-to-refresh on `AppointmentDayList`: refetches `GET /v1/inspector/schedule?date=selectedDate`
- Horizontal swipe on `DaySelectorStrip`: native horizontal scroll (no swipe-to-navigate)

### Feedback

- Day selection: immediate UI update (no skeleton re-render), new data loads in background
- Start button tap: navigates immediately (no loading state needed here — execution page handles geo loading)

### Responsive Behavior

- Single-column layout on all screen sizes (mobile-first)
- Cards are full-width with comfortable touch padding (min 12px horizontal padding, 16px vertical)
- "Open in Maps" on detail: opens as native Maps on iOS/Android via `maps://` URI

### Empty States

- Today, no appointments: full-card illustration, "No inspections today. Enjoy your day off!"
- Future day, no appointments: "No inspections scheduled for [day name, date]"
- Range loaded with no appointments at all in 14 days: "No upcoming inspections in the next 2 weeks."

### Offline Banner

When `useIsOnline()` returns false:
- A yellow banner at top of schedule page: "You're offline. Showing cached data."
- Banner disappears when connection restored (with brief "Back online" green confirmation)

### Performance Notes

- Appointment cards use `React.memo` to avoid re-renders on day selection
- `DaySelectorStrip` uses virtualization if > 14 chips (unlikely but safe)
- API responses for schedule are cached with a 24-hour `gcTime` to support offline access to the last loaded data
