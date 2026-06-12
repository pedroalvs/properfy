# Properties – Web Feature Spec

> Portal: Client Portal + Master Admin (apps/web)
> Last updated: 2026-03-15

---

## 1. Overview

The Properties feature manages the physical locations where inspections occur. Each property belongs to a tenant (agency) and optionally to a branch within that agency. Properties are geocoded automatically after creation so they can be displayed on maps and associated with service groups by geographic region.

**Portals involved:**
- Portal Imobiliaria/Cliente (roles: CL_ADMIN, CL_USER)
- Portal Master Admin (roles: AM, OP)

**Pages/screens:**
1. Properties List (`/properties`)
2. Create Property (`/properties/new`)
3. Property Detail/Edit (`/properties/:id`)

---

## 2. Pages & Routes

| Path | Component | Portal | Description |
|---|---|---|---|
| `/properties` | `PropertiesListPage` | Both | Filterable table of properties |
| `/properties/new` | `PropertyCreatePage` | Both | Creation form |
| `/properties/:id` | `PropertyDetailPage` | Both | Detail view with edit and linked appointments |

Route access:

```tsx
<Route path="/properties" element={<AuthGuard roles={['AM','OP','CL_ADMIN','CL_USER']}><PropertiesListPage /></AuthGuard>} />
<Route path="/properties/new" element={<AuthGuard roles={['AM','OP','CL_ADMIN','CL_USER']}><PropertyCreatePage /></AuthGuard>} />
<Route path="/properties/:id" element={<AuthGuard roles={['AM','OP','CL_ADMIN','CL_USER']}><PropertyDetailPage /></AuthGuard>} />
```

---

## 3. TypeScript Interfaces

```typescript
// Property type enum
type PropertyType = 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'RURAL';

// Geocoding status
type GeocodingStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

// Full property entity
interface Property {
  id: string;
  tenantId: string;
  branchId: string;
  branch: BranchSummary;
  propertyCode: string;       // agency-assigned code, unique within tenant
  type: PropertyType;
  streetAddress: string;      // street number + name
  addressLine2: string | null; // unit/apt number, floor, etc.
  suburb: string;
  postcode: string;
  state: string;              // e.g. "VIC", "NSW"
  country: string;            // default "AU"
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  notes: string | null;
  createdAt: string;          // ISO 8601
  updatedAt: string;
}

// List item (lighter payload)
interface PropertyListItem {
  id: string;
  propertyCode: string;
  type: PropertyType;
  streetAddress: string;
  suburb: string;
  postcode: string;
  state: string;
  branch: Pick<BranchSummary, 'id' | 'name'>;
  geocodingStatus: GeocodingStatus;
  createdAt: string;
}

// Paginated response
interface PaginatedProperties {
  data: PropertyListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Create payload
interface CreatePropertyPayload {
  branchId: string;
  propertyCode: string;
  type: PropertyType;
  streetAddress: string;
  addressLine2?: string;
  suburb: string;
  postcode: string;
  state: string;
  country?: string;           // default "AU" if omitted
  notes?: string;
}

// Update payload
interface UpdatePropertyPayload {
  propertyCode?: string;
  type?: PropertyType;
  streetAddress?: string;
  addressLine2?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  notes?: string;
}

// List filters
interface PropertyFilters {
  branchId?: string;
  type?: PropertyType;
  geocodingStatus?: GeocodingStatus;
  search?: string;            // matches street, suburb, postcode, propertyCode
  page?: number;
  pageSize?: number;
  sortBy?: 'propertyCode' | 'suburb' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Appointment linked to property (lightweight)
interface PropertyAppointmentSummary {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  serviceType: ServiceType;
  status: AppointmentStatus;
  inspector: Pick<InspectorSummary, 'id' | 'fullName'> | null;
}

// Branch summary (reuse from appointments spec)
interface BranchSummary {
  id: string;
  name: string;
  tenantId: string;
}

// Reuse from appointments spec
type ServiceType = 'ROUTINE' | 'INGOING' | 'OUTGOING' | 'VACATE' | 'MAINTENANCE';
type AppointmentStatus = 'DRAFT' | 'AWAITING_INSPECTOR' | 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'REJECTED';
interface InspectorSummary { id: string; fullName: string; phone: string; }
```

---

## 4. Screens

### 4.1 Properties List (`/properties`)

**Layout template:** `MainLayout` with full-width table panel.

**Components used:**
- `PropertyFiltersBar` – filter row
- `PropertyTable` – data table
- `GeocodingStatusBadge` – inline geocoding status
- `Pagination` – page controls
- `CreatePropertyButton` – header CTA (role-gated)

**Data consumed:**
```
GET /v1/properties?branchId=&type=&geocodingStatus=&search=&page=&pageSize=&sortBy=&sortOrder=
→ PaginatedProperties
```

**React Query key:**
```typescript
['properties', 'list', filters]
```

**States:**

| State | UI behavior |
|---|---|
| Loading | Skeleton rows (10) |
| Empty (no filter) | Empty state: "No properties yet. Add your first property." + Create button |
| Empty (filtered) | "No properties match your filters." + clear filters link |
| Error | Error banner with retry button |

**Available actions by role:**

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| View list | Y | Y | Y (own tenant) | Y (own tenant) |
| Create new | Y | Y | Y | N |
| Export list | Y | Y | Y | N |

**Table columns:**

| Column | Sortable | Notes |
|---|---|---|
| Property Code | Y | Link to detail page |
| Address | N | streetAddress + suburb + postcode |
| Type | N | Badge: Residential / Commercial / Industrial / Rural |
| Branch | N | branch.name |
| Geocoding | N | `GeocodingStatusBadge` |
| Actions | N | View button |

**Filter bar:**
- Branch select (scoped to user's tenant for CL roles; all for AM/OP)
- Property type select (Residential / Commercial / Industrial / Rural / All)
- Geocoding status select (All / Pending / Success / Failed)
- Text search (debounced 300ms, min 2 chars) – matches street address, suburb, postcode, property code

---

### 4.2 Create Property (`/properties/new`)

**Layout template:** `MainLayout` with centered form card (max-width 640px).

**Components used:**
- `BranchSelect`
- `PropertyTypeSelect`
- `AddressForm` – structured address fields
- `NotesTextarea`
- `FormActions`

**Data consumed:**
```
GET /v1/branches → BranchSummary[] (scoped by role)
POST /v1/properties → Property
```

**States:**

| State | UI behavior |
|---|---|
| Form idle | All fields enabled |
| Submitting | Submit button spinner, fields disabled |
| Submit error | Inline error banner above actions |
| Submit success | Navigate to `/properties/:newId`, show toast "Property created. Geocoding in progress." |

**Available actions by role:**

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| Access page | Y | Y | Y | N |
| Select any branch | Y | Y | N (own tenant only) | N |

**Form fields and validations:**

| Field | Required | Validation |
|---|---|---|
| Branch | Yes | Valid branch ID, scoped to tenant |
| Property Code | Yes | 1–50 chars, alphanumeric + hyphens; unique within tenant (server-side) |
| Type | Yes | One of RESIDENTIAL, COMMERCIAL, INDUSTRIAL, RURAL |
| Street Address | Yes | 5–200 chars |
| Address Line 2 | No | Max 100 chars |
| Suburb | Yes | 2–100 chars |
| Postcode | Yes | Australian postcode regex: `^\d{4}$` |
| State | Yes | One of: ACT, NSW, NT, QLD, SA, TAS, VIC, WA |
| Country | No | Default "AU"; not exposed in form (always AU) |
| Notes | No | Max 1000 chars |

**Post-creation note:** After POST succeeds, geocoding is triggered asynchronously by the backend. The frontend does NOT wait for geocoding; it shows "Geocoding in progress..." in the property detail page.

---

### 4.3 Property Detail (`/properties/:id`)

**Layout template:** `MainLayout` with two-column layout on desktop (info left, map right), single-column on mobile.

**Sections:**
1. Property header (code, type badge, address)
2. Details panel (branch, address, notes)
3. Geocoding status + map preview
4. Edit controls (role-gated)
5. Linked appointments section

**Data consumed:**
```
GET /v1/properties/:id → Property
GET /v1/appointments?propertyId=:id&pageSize=10&sortBy=scheduledDate&sortOrder=desc
→ PaginatedAppointments (PropertyAppointmentSummary)
```

**React Query keys:**
```typescript
['properties', 'detail', id]
['appointments', 'list', { propertyId: id }]
```

**States (page-level):**

| State | UI behavior |
|---|---|
| Loading | Full-page skeleton |
| Not found | 404 card + "Back to Properties" |
| Error | Error card + retry |
| No permission | 403 card (tenant mismatch) |

**Edit behavior:**
- "Edit" button visible for AM, OP, CL_ADMIN only
- Opens `PropertyEditModal` (inline modal, not new page)
- Form pre-populated with current values
- On save: `PATCH /v1/properties/:id` + optimistic update

**Geocoding status section:**
- `GeocodingStatusBadge` displayed prominently
- PENDING: yellow badge "Geocoding in progress..."
  - Auto-refresh query every 10s while status is PENDING
- SUCCESS: show `MapboxPreview` component with property pin
- FAILED: red badge "Geocoding failed" + "Retry Geocoding" button (OP/AM only)
  - Retry: `POST /v1/properties/:id/geocode`

**Map preview (`MapboxPreview`):**
- Shows property location with a red pin
- Zoom level: 15
- Read-only (no interaction)
- Link: "Open in Google Maps" → `https://www.google.com/maps?q={latitude},{longitude}`
- Height: 240px on desktop, 180px on mobile

**Linked appointments section:**
- Table: date, time slot, service type, status chip, inspector name
- Max 10 rows shown; "View all appointments" link → `/appointments?propertyId=:id`
- Empty state: "No appointments for this property yet."

---

## 5. Components

### `GeocodingStatusBadge`

```typescript
interface GeocodingStatusBadgeProps {
  status: GeocodingStatus;
  size?: 'sm' | 'md';
}
```

**Color mapping:**

| Status | Background | Text | Icon |
|---|---|---|---|
| PENDING | yellow-100 | yellow-700 | loader (spinning) |
| SUCCESS | green-100 | green-700 | map-pin |
| FAILED | red-100 | red-700 | alert-circle |

---

### `PropertyTypeSelect`

```typescript
interface PropertyTypeSelectProps {
  value: PropertyType | null;
  onChange: (type: PropertyType) => void;
  error?: string;
  disabled?: boolean;
}
```

Options: "Residential", "Commercial", "Industrial", "Rural"

---

### `AddressForm`

```typescript
interface AddressFormProps {
  value: {
    streetAddress: string;
    addressLine2: string;
    suburb: string;
    postcode: string;
    state: string;
  };
  onChange: (address: AddressFormValue) => void;
  errors?: Partial<Record<keyof AddressFormValue, string>>;
  disabled?: boolean;
}
```

Australian state options: `['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']`

---

### `MapboxPreview`

```typescript
interface MapboxPreviewProps {
  latitude: number;
  longitude: number;
  height?: number; // default 240
  showGoogleMapsLink?: boolean; // default true
}
```

Uses Mapbox GL JS. Requires `VITE_MAPBOX_TOKEN` environment variable. Fallback: if token not configured, shows static gray placeholder with coordinates text.

---

### `PropertyEditModal`

```typescript
interface PropertyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  onSuccess: (updated: Property) => void;
}
```

Re-uses `AddressForm` and `PropertyTypeSelect` internally. Submit triggers `PATCH /v1/properties/:id`.

---

### `PropertyFiltersBar`

```typescript
interface PropertyFiltersBarProps {
  filters: PropertyFilters;
  onChange: (filters: PropertyFilters) => void;
  onClear: () => void;
  branches: BranchSummary[];
}
```

---

## 6. API Integration

### Endpoints

```typescript
// List properties
GET /v1/properties
Query: PropertyFilters
Response: PaginatedProperties

// Get single property
GET /v1/properties/:id
Response: Property

// Create property
POST /v1/properties
Body: CreatePropertyPayload
Response: Property

// Update property
PATCH /v1/properties/:id
Body: UpdatePropertyPayload
Response: Property

// Retry geocoding
POST /v1/properties/:id/geocode
Response: Property (with geocodingStatus: 'PENDING')

// Export list
GET /v1/properties/export
Query: PropertyFilters
Response: Blob (XLSX)
```

### React Query Hooks

```typescript
// List hook
function useProperties(filters: PropertyFilters) {
  return useQuery({
    queryKey: ['properties', 'list', filters],
    queryFn: () => propertiesApi.list(filters),
    keepPreviousData: true,
    staleTime: 60_000,
  });
}

// Detail hook (with geocoding polling)
function useProperty(id: string) {
  const { data } = useQuery({
    queryKey: ['properties', 'detail', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: !!id,
    refetchInterval: (data) =>
      data?.geocodingStatus === 'PENDING' ? 10_000 : false,
  });
  return data;
}

// Create mutation
function useCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePropertyPayload) => propertiesApi.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['properties', 'list'] });
      queryClient.setQueryData(['properties', 'detail', data.id], data);
    },
  });
}

// Update mutation
function useUpdateProperty(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePropertyPayload) => propertiesApi.update(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['properties', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['properties', 'list'] });
    },
  });
}

// Retry geocoding mutation
function useRetryGeocoding(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => propertiesApi.retryGeocode(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['properties', 'detail', id], data);
    },
  });
}

// Search hook (used by PropertySearch combobox in appointments)
function usePropertySearch(query: string, branchId: string | null) {
  return useQuery({
    queryKey: ['properties', 'search', query, branchId],
    queryFn: () => propertiesApi.list({ search: query, branchId: branchId ?? undefined, pageSize: 20 }),
    enabled: query.length >= 3,
    staleTime: 30_000,
  });
}
```

---

## 7. Business Rules in Frontend

### Validation Rules

- `propertyCode` must be unique within the tenant. If the server returns a 409 conflict, show inline error: "Property code already exists for your agency."
- `postcode` must match `^\d{4}$` (Australian 4-digit postcode)
- `state` must be one of the 8 Australian state/territory codes
- A property cannot be deleted if it has active appointments (AWAITING_INSPECTOR or SCHEDULED). The delete action is not exposed in this spec (no delete feature in v1).

### Geocoding Rules

- Geocoding is always triggered server-side after create or address update
- Frontend polls `/properties/:id` every 10s while `geocodingStatus === 'PENDING'`
- Polling stops when status changes to SUCCESS or FAILED
- Maximum poll duration: 5 minutes (30 polls × 10s); after that, show warning "Geocoding is taking longer than expected"

### Tenant Scoping Rules

- CL_ADMIN and CL_USER can only see properties belonging to their tenant
- AM and OP see all properties across all tenants; they see a "Tenant" column in the table (added to the list columns when role is AM or OP)
- Branch filter for CL roles shows only their own branches

### Edit Permissions

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| Edit property | Y | Y | Y | N |
| Retry geocoding | Y | Y | N | N |
| Create property | Y | Y | Y | N |

---

## 8. UX Rules

### Navigation Flows

- After successful create: navigate to `/properties/:newId`, show toast "Property created. Geocoding in progress."
- After successful edit: close modal, show toast "Property updated.", map refreshes if coordinates changed
- "Back" button on create/detail page: goes to `/properties`

### Destructive Confirmations

- No delete action in v1; no destructive confirmation needed

### Success/Error Feedback

- Success: green toast, top-right, 4 seconds
- 409 (duplicate property code): inline field error
- 422 (validation): inline field errors mapped from server error `details`
- Network error: red persistent toast

### Responsive Behavior

- List: table on desktop, card stack on mobile (< 768px)
  - Card shows: property code, address, type badge, geocoding badge
- Detail: two-column (info + map) on desktop; single-column stacked on mobile
  - Map moves below property info on mobile
- Create form: single column on all screen sizes (already narrow)

### Geocoding UX Details

- Immediately after creating a property, the detail page shows a prominent yellow info banner: "We're looking up coordinates for this address. The map will appear shortly."
- When geocoding completes (SUCCESS), the banner disappears and the map fades in with an animation
- When geocoding fails (FAILED), the yellow banner changes to red: "We couldn't find coordinates for this address. Please check the address and retry."

### Property Code Display

- Property codes are displayed in a monospace font for readability
- In tables, the property code is a clickable link to the detail page

### Linked Appointments Pagination

- The linked appointments section on the detail page shows the 10 most recent appointments
- "Show all" link navigates to `/appointments?propertyId=:id`
- The appointments mini-table is not sortable or filterable (full functionality on the appointments page)
