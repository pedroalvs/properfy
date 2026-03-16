# Marketplace – PWA Feature Spec

> App: Inspector Mobile App (apps/pwa)
> Last updated: 2026-03-15

---

## 1. Overview

The Marketplace screen is where inspectors browse and accept batches of appointments (Service Groups) that have been published by operators. Inspectors can view the details of each offer, decide whether it fits their schedule, and accept it with a single tap. The "first valid acceptance wins" model means accepting quickly is important, and the UI must handle race conditions gracefully.

**App:** Inspector PWA (apps/pwa)
**Auth:** JWT (INSP role)
**Design:** Mobile-first card feed; fast, decisive UX

**Pages/screens:**
1. Marketplace (`/marketplace`) — list of available offers (published service groups)

---

## 2. Pages & Routes

| Path | Component | Description |
|---|---|---|
| `/marketplace` | `MarketplacePage` | Card feed of available service group offers |

Route access:

```tsx
<Route
  path="/marketplace"
  element={<InspectorAuthGuard><MarketplacePage /></InspectorAuthGuard>}
/>
```

---

## 3. TypeScript Interfaces

```typescript
// Marketplace offer (a published ServiceGroup)
interface MarketplaceOffer {
  groupId: string;
  serviceType: MarketplaceServiceType;
  scheduledDate: string;               // "YYYY-MM-DD"
  timeWindowStart: string;             // "HH:MM"
  timeWindowEnd: string;               // "HH:MM"
  appointmentCount: number;            // number of appointments in the group
  regionSummary: string;               // e.g. "Brunswick, Fitzroy, Collingwood"
  suburbs: string[];                   // individual suburb list
  estimatedDistance: number | null;    // km from inspector's current location (if geolocation available)
  confirmedCount: number;              // appointments with CONFIRMED tenant
  pendingCount: number;                // appointments with PENDING tenant confirmation
  publishedAt: string;                 // ISO 8601
}

// Service type labels for marketplace context
type MarketplaceServiceType =
  | 'ROUTINE'
  | 'INGOING'
  | 'OUTGOING'
  | 'VACATE'
  | 'MAINTENANCE';

// Marketplace list response
interface MarketplaceOffersResponse {
  offers: MarketplaceOffer[];
  totalCount: number;
}

// Accept offer payload
interface AcceptOfferPayload {
  // No body needed — groupId is in the URL
}

// Accept offer response (success)
interface AcceptOfferSuccessResponse {
  groupId: string;
  appointmentCount: number;
  scheduledDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
}

// Accept offer error response (race condition — already accepted)
interface AcceptOfferConflictError {
  error: {
    code: 'OFFER_ALREADY_ACCEPTED';
    message: string;
  };
}

// Accept offer error response (offer no longer available — cancelled or expired)
interface AcceptOfferGoneError {
  error: {
    code: 'OFFER_NOT_AVAILABLE';
    message: string;
  };
}

// Local UI state for accepting
type OfferAcceptState =
  | 'IDLE'
  | 'CONFIRMING'      // Confirmation modal open
  | 'ACCEPTING'       // POST in flight
  | 'ACCEPTED'        // Success
  | 'CONFLICT'        // Lost the race — another inspector accepted first
  | 'GONE'            // Offer no longer exists (cancelled by operator)
  | 'ERROR';          // Unexpected error
```

---

## 4. Screen: Marketplace (`/marketplace`)

**Layout template:** `PwaLayout` with bottom navigation bar (Marketplace tab).

**Components:**
- `OfferFeed` — scrollable list of `OfferCard` components
- `EmptyMarketplace` — empty state when no offers
- `OfflineMarketplaceBanner` — shown when offline
- `PullToRefresh` wrapper

**Data consumed:**
```
GET /v1/marketplace/offers
→ MarketplaceOffersResponse
```

**React Query key:**
```typescript
['marketplace', 'offers']
```

**Polling:** Offers are auto-refreshed every 60 seconds while the screen is in focus. Additionally, pull-to-refresh manually triggers a refetch.

**States:**

| State | UI behavior |
|---|---|
| Loading (initial) | Skeleton cards (3) |
| Loading (refresh) | Subtle spinner at top (not blocking content) |
| Empty (no offers) | Empty state illustration + message |
| Error | Error banner + retry button |
| Offline | Offline banner; no cards (marketplace requires live data — no offline caching) |

---

### Offer Card

**Component:** `OfferCard`

```typescript
interface OfferCardProps {
  offer: MarketplaceOffer;
  acceptState: OfferAcceptState;
  onAccept: (groupId: string) => void;
  onViewDetails: (groupId: string) => void;
}
```

**Card layout:**

```
┌─────────────────────────────────────────┐
│ [Service Type Badge]   [Date]           │
│                                         │
│ [Time Window]                           │
│ [Region Summary]                        │
│                                         │
│ X inspections  ·  [Confirmation chips]  │
│                                         │
│ [Distance if available]                 │
│                                         │
│ [Details ▼]        [Accept Button →]   │
└─────────────────────────────────────────┘
```

**Field display details:**

- **Service Type Badge:** colored badge (see `ServiceTypeBadge` from schedule spec)
- **Date:** "Monday 15 March" — "TODAY" badge appended if scheduledDate === today
- **Time Window:** "09:00 AM – 11:00 AM"
- **Region Summary:** `regionSummary` string from API (e.g., "Brunswick, Fitzroy, Collingwood")
- **Inspection Count:** "5 inspections" (appointmentCount)
- **Confirmation chips:** Two small badges side by side:
  - "✓ X confirmed" (green, confirmedCount)
  - "? X pending" (yellow, pendingCount)
- **Distance:** "~X km away" if `estimatedDistance` is available; omitted if null
- **Published at:** "Posted X minutes ago" — relative time, updates every 60s

**Accept button variants by state:**

| State | Button label | Style | Behavior |
|---|---|---|---|
| IDLE | "Accept" | Green primary | Opens confirm modal |
| CONFIRMING | — | — | Modal open |
| ACCEPTING | spinner | Green, disabled | API call in flight |
| ACCEPTED | "Accepted ✓" | Green, disabled | Read-only |
| CONFLICT | "Already taken" | Gray, disabled | Informational |
| GONE | "No longer available" | Gray, disabled | Informational |
| ERROR | "Try again" | Red outlined | Retries acceptance |

---

### Offer Details Expansion

Tapping "Details ▼" on the card expands an inline panel:

```
┌─────────────────────────────────────────┐
│ DETAILS [collapse ▲]                   │
│                                         │
│ Suburbs:                                │
│   • Brunswick                           │
│   • Fitzroy                             │
│   • Collingwood                         │
│                                         │
│ Tenant Confirmations:                   │
│   ████████░░ 3/5 confirmed             │
└─────────────────────────────────────────┘
```

The expansion is animated (CSS transition, max-height). No navigation required — all in the card.

---

### Accept Confirmation Modal

**Component:** `AcceptOfferModal`

```typescript
interface AcceptOfferModalProps {
  isOpen: boolean;
  offer: MarketplaceOffer;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}
```

**Modal content:**
```
┌──────────────────────────────┐
│  Accept this group?          │
│                              │
│  Service: Routine            │
│  Date: Monday 15 March       │
│  Time: 09:00 – 11:00         │
│  Inspections: 5              │
│  Region: Brunswick, Fitzroy  │
│                              │
│  [Cancel]   [Accept Group]   │
└──────────────────────────────┘
```

- "Accept Group" button: green, primary
- "Cancel" button: text button (no styling)
- While loading (ACCEPTING state): "Accept Group" button shows spinner, both buttons disabled
- Modal cannot be dismissed by backdrop tap while loading

---

### Race Condition Outcomes

**When acceptance wins (HTTP 200):**
- Modal closes
- Card transitions to ACCEPTED state (green "Accepted ✓" button, card gets green left border)
- Toast: "You accepted this group! Check your Schedule for the new appointments."
- After 3 seconds: ACCEPTED cards fade to 50% opacity (still visible but clearly taken)
- Appointments now appear on inspector's schedule

**When acceptance loses (HTTP 409 — `OFFER_ALREADY_ACCEPTED`):**
- Modal closes
- Card transitions to CONFLICT state
- Toast (amber): "Another inspector accepted this group just before you. Keep looking!"
- Card shows "Already taken" button in gray

**When offer no longer exists (HTTP 410 or 404 — `OFFER_NOT_AVAILABLE`):**
- Modal closes
- Card transitions to GONE state
- Toast (amber): "This offer is no longer available."
- Card shows "No longer available" button in gray

**On unexpected error (HTTP 5xx or network error):**
- Modal closes
- Card transitions to ERROR state
- Toast (red): "Something went wrong. Tap 'Try again' to retry."
- "Try again" button retries the POST

---

## 5. Components

### `OfferCard`

(Defined above — see Section 4)

---

### `AcceptOfferModal`

(Defined above — see Section 4)

---

### `OfferFeed`

```typescript
interface OfferFeedProps {
  offers: MarketplaceOffer[];
  offerStates: Record<string, OfferAcceptState>;  // groupId → state
  onAccept: (groupId: string) => void;
  isLoading: boolean;
}
```

Renders `OfferCard` for each offer. Offers sorted by `publishedAt` descending (newest first). Offers that are ACCEPTED, CONFLICT, or GONE are moved to the bottom of the list.

---

### `EmptyMarketplace`

```typescript
interface EmptyMarketplaceProps {}
```

Displays:
- Illustration: magnifying glass over a calendar
- Heading: "No offers available right now"
- Body: "New groups are published by your operator. Pull down to refresh or check back later."
- "Refresh" button (triggers refetch)

---

### `OfflineMarketplaceBanner`

```typescript
interface OfflineMarketplaceBannerProps {}
```

Displays:
- Yellow banner at top of page
- "You're offline. The marketplace requires an internet connection."
- No offer cards are shown when offline (unlike Schedule which shows cached data)

---

### `MarketplaceLastUpdated`

```typescript
interface MarketplaceLastUpdatedProps {
  lastUpdatedAt: Date | null;
}
```

Small gray text below the page header: "Updated X minutes ago" — updates every 60s.

---

## 6. API Integration

### Endpoints

```typescript
// List available offers (published service groups not yet accepted)
GET /v1/marketplace/offers
Response: MarketplaceOffersResponse

// Accept an offer
POST /v1/marketplace/offers/:groupId/accept
Headers: { 'Idempotency-Key': string }
Body: {}
Response 200: AcceptOfferSuccessResponse
Response 409: AcceptOfferConflictError
Response 410: AcceptOfferGoneError  (or 404 if group not found at all)
```

### React Query Hooks

```typescript
// Marketplace offers hook
function useMarketplaceOffers() {
  return useQuery({
    queryKey: ['marketplace', 'offers'],
    queryFn: () => marketplaceApi.getOffers(),
    staleTime: 30_000,         // 30 seconds — marketplace data is time-sensitive
    gcTime: 5 * 60_000,        // 5 minutes GC (intentionally short — don't serve stale offers)
    refetchInterval: 60_000,   // auto-refresh every 60 seconds while focused
    refetchIntervalInBackground: false, // stop polling when tab/app is backgrounded
    retry: 2,
  });
}

// Accept offer mutation
function useAcceptOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      idempotencyKey,
    }: {
      groupId: string;
      idempotencyKey: string;
    }) => marketplaceApi.acceptOffer(groupId, idempotencyKey),
    onSuccess: (data, { groupId }) => {
      // After accepting, invalidate both marketplace (remove the offer)
      // and inspector schedule (new appointments appear)
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'offers'] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
    },
    onError: (error, { groupId }) => {
      // Do not invalidate marketplace on error — let the card state handle it
    },
  });
}
```

### Idempotency Key for Acceptance

```typescript
// Generate once per acceptance attempt; stored in component state
// If user taps "Try again" (ERROR state), a NEW idempotency key is generated
// (the previous attempt failed, so a fresh key is correct)

function generateAcceptanceKey(): string {
  return crypto.randomUUID();
}
```

The idempotency key is generated when the user taps "Accept" (entering CONFIRMING state), before the modal opens. If they cancel and try again on a different day, a new key is generated.

---

## 7. Business Rules in Frontend

### First Valid Acceptance Wins

The backend resolves race conditions at the database level (optimistic locking or `SELECT FOR UPDATE`). The frontend handles the outcome via HTTP status codes:
- 200: Inspector won the race — offer accepted
- 409: Inspector lost the race — conflict, another inspector accepted first
- 410/404: Offer was cancelled or no longer exists

No special frontend locking logic is needed; simply handle the response.

### Idempotency Safety

- An idempotency key is generated fresh each time the user taps "Accept" (on a different card or after clearing an ERROR state)
- If the inspector is in ACCEPTING state and the app crashes/closes, reopening and tapping "Accept" again generates a new key (the previous attempt is unknown — the backend idempotency key prevents double-acceptance)
- On ERROR state, a NEW idempotency key is generated for the "Try again" attempt (the first attempt failed, so idempotency is not needed for the retry from a business standpoint, but a new key is cleaner)

### No Offline Acceptance

- If the inspector is offline and taps "Accept": show immediate error "You need to be connected to accept offers. Please check your internet connection."
- Do NOT queue acceptance for offline sync — acceptance is time-sensitive and must be real-time

### Offer Visibility

- Only `PUBLISHED` service groups that have not yet been accepted appear in the marketplace
- Once accepted (by anyone), the group disappears from the feed for all inspectors on the next refresh
- The auto-refresh every 60 seconds handles this without requiring real-time WebSocket infrastructure

### "Today" Badge Logic

```typescript
function isToday(date: string): boolean {
  return date === format(new Date(), 'yyyy-MM-dd');
}
```

"TODAY" badge is shown on offer cards where `scheduledDate` equals today's date.

### Distance Calculation

- If the inspector has granted location permission AND the phone can provide geolocation:
  - The app can optionally POST the inspector's current location to a dedicated endpoint OR compute distance client-side from property coordinates
  - In v1: Distance is provided server-side by the API as `estimatedDistance` (based on region centroid vs inspector's registered address — no real-time GPS required)
  - The field is `null` if distance cannot be computed; the UI simply omits the distance line

### Offer Sorting

Offers in the feed are sorted:
1. IDLE offers first (sorted by `publishedAt` descending — newest first)
2. ACCEPTED, CONFLICT, GONE offers last (sorted by when they transitioned)

This keeps actionable offers at the top.

---

## 8. UX Rules

### Navigation Flows

- Bottom nav bar: "Marketplace" tab (shopping bag or lightning bolt icon) — navigates to `/marketplace`
- No navigation away from this page for accepting; all interaction is in-place (cards + modal)
- After acceptance: "Check your Schedule" toast includes no navigation — inspector stays on marketplace to see other offers

### Gestures

- Pull-to-refresh: triggers `refetch()` on the marketplace query
  - Pull indicator: spinning icon at top
  - On complete: `MarketplaceLastUpdated` text updates
- No swipe-to-accept gesture (too risky for accidental acceptance)

### Confirmation Flow Details

- Accept button tapped → confirmation modal opens immediately (no API call yet)
- Inspector reads the summary → taps "Accept Group" → API call fires
- The modal gives the inspector one final chance to review before committing
- Backdrop click dismisses modal in IDLE/CONFIRMING state; disabled while ACCEPTING

### Feedback

| Event | Feedback |
|---|---|
| Accepted (win) | Green toast "You accepted this group! Check your Schedule." + card style update |
| Conflict (lost race) | Amber toast "Another inspector accepted this just before you." |
| Offer gone | Amber toast "This offer is no longer available." |
| Error | Red toast "Something went wrong. Tap 'Try again'." |
| Pull-to-refresh complete | No toast; `MarketplaceLastUpdated` updates |
| Auto-refresh (60s) | No toast; card list updates silently |

### Offline Handling

- Marketplace does NOT work offline (unlike Schedule which caches data)
- If offline when page opens: show `OfflineMarketplaceBanner`, no cards, no skeleton
- If connection drops while viewing: add offline banner, disable all "Accept" buttons with tooltip "No connection"
- If connection restores: remove banner, re-enable buttons, auto-refetch offers

### Empty State

- "No offers available right now. New groups are published by your operator. Pull down to refresh or check back later."
- "Refresh" button at bottom of empty state

### Performance

- Offer cards are `React.memo`-wrapped (state changes like ACCEPTING on one card don't rerender others)
- List virtualization: not needed for < 50 items (typical marketplace has 3–15 offers)
- Images: no images in marketplace cards (text-only for fast loading on mobile data)

### Accessibility

- All tap targets minimum 44×44px
- Accept button is clearly distinct from the card itself (not the whole card)
- Race condition messages use role="alert" for screen reader announcement
- "Already taken" / "No longer available" states conveyed textually, not color-only
