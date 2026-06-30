# Frontend Web (React + Vite) – Guidance for Claude Code

You are working inside **`apps/web/`** of the Properfy monorepo.

The web frontend implements three portals:

1. **Portal Master Admin** – Platform-wide management (tenants, inspectors, financial, reports)
2. **Portal Imobiliaria/Cliente** – Agency operations (appointments, properties, service groups)
3. **Portal Inquilino** – Tenant confirmation/rescheduling (via unique link, public access)

The frontend is an **evolution of the legacy UI system** (Vue 2 + Vuetify 2), not a free redesign. You must preserve the visual identity and patterns while modernizing the implementation.

---

## 1. Tech stack

- **Build tool:** Vite
- **Framework:** React
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Font:** Nunito (Google Fonts)
- **Icons:** Material Design Icons (`@mdi/font`)
- **Maps:** Mapbox
- **HTTP client:** OpenAPI-generated client (source of truth for API contracts)
- **State:** React Query + local component state
- **Tests:** Vitest (unit) + Playwright (E2E)

Do **not** change the stack unless explicitly instructed.

---

## 2. Development commands

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Generate API client from OpenAPI spec
pnpm generate:api
```

---

## 3. Project structure

```text
apps/web/
├── src/
│   ├── app/                    # App shell, routing, providers
│   ├── components/
│   │   ├── shell/              # AppShell, Sidebar, SidebarItem, SidebarSubmenu, SidebarUser
│   │   ├── ui/                 # Design system primitives (buttons, inputs, chips, dialogs, tabs, drawers)
│   │   ├── data/               # DataTable, RowActions, EntityListCard, TableSwitch, BooleanIcon
│   │   ├── filters/            # FilterBar, FilterInput, FilterSelect, FilterAutocomplete, FilterDateRange, FilterBoolean
│   │   ├── feedback/           # Snackbar, EmptyState, ErrorState, LoadingState, InfoBanner
│   │   ├── layout/             # PageHeader, PageSectionHeader, templates
│   │   └── map/                # MapScreenLayout, MapFiltersPanel, MapFloatingAction
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── appointments/
│   │   ├── properties/
│   │   ├── service-groups/
│   │   ├── marketplace/
│   │   ├── inspectors/
│   │   ├── tenants/
│   │   ├── rental-tenant-portal/
│   │   ├── notifications/
│   │   ├── billing/
│   │   ├── reports/
│   │   └── settings/
│   ├── services/               # API clients (generated from OpenAPI)
│   ├── hooks/                  # Shared hooks (useAuth, useToast, useDebouncedSearch, etc.)
│   ├── lib/                    # Helpers (formatCurrency, formatDate, status helpers, masks)
│   ├── types/                  # DTOs and API types (from packages/shared when applicable)
│   ├── assets/                 # Validated SVG assets (no legacy branding)
│   └── main.tsx
└── ...
```

**Guidelines:**

- **Shell components** are generic and reusable.
- **Features** group pages, specific components and hooks by domain.
- **Services** are generated from OpenAPI – do not create manual API clients.
- Avoid putting business logic directly in page components.
- Use components from `packages/shared` for shared types and enums.

---

## 4. Design tokens (mandatory)

### Colors

```css
--color-primary: #009DD9;        /* Links, inputs focus, active icons */
--color-secondary: #21566E;      /* Page titles, active tabs, sidebar indicators */
--color-accent: #41A69D;         /* Teal elements */
--color-error: #FF5252;          /* Delete buttons, errors */
--color-info: #00CAE3;           /* Informational */
--color-success: #4CAF50;        /* True booleans, success */
--color-warning: #FB8C00;        /* Pending status */
--color-realty: #215676;         /* Sidebar active, secondary titles */
--color-real-estate: #F37A76;    /* CTA buttons (coral), tab slider, action buttons */
--color-app-bg: #F5F5F5;        /* Main background */
--color-card-bg: #FFFFFF;       /* Card backgrounds */
--color-text-primary: rgba(0,0,0,0.87);
--color-text-secondary: rgba(0,0,0,0.6);
--color-text-muted: rgb(158,158,158);
--color-text-disabled: rgba(0,0,0,0.38);
```

### Typography

- Font: `Nunito` (400, 500, 600, 700)
- Body: `16px`, `500`, `line-height: 24px`, `letter-spacing: 0.5px`
- Page title: `24px`, `700`, `#21566E` (mobile: `20px`)
- Dialog title: `20px`, `500`
- Table header: `14px`, `700`, `rgba(0,0,0,0.6)`
- Table body: `14px`, `400`
- Tabs: `14px`, `700`

### Spacing & radius

- Page padding: `24px` vertical, `32px` horizontal
- Default radius: `4px` (modals/submenus may use `6px` or `8px`)
- Sidebar width: `75px` (fixed)

---

## 5. Status visual map (mandatory, centralized)

| Status | Background | Text |
|---|---|---|
| `DRAFT` | `purple lighten-4` (#E1BEE7) | Dark |
| `AWAITING_INSPECTOR` / `OPEN` | `orange lighten-4` (#FFE0B2) | Dark |
| `SCHEDULED` | `light-blue lighten-4` (#B3E5FC) | Dark |
| `DONE` | `green lighten-4` (#C8E6C9) | Dark |
| `CANCELLED` | `red lighten-4` (#FFCDD2) | Dark |
| `REJECTED` | `deep-orange lighten-4` | Dark |

**Rules:**

- `StatusChip` must use a centralized lookup – no local status mapping per page.
- All 6 statuses must be in the design system.

---

## 6. Layout rules

### Shell

1. Fixed sidebar left (`75px`)
2. Main area with background `#F5F5F5`
3. Page padding: `24px` vertical, `32px` horizontal
4. Map views: sidebar background matches canvas gray

### Page structure

1. `PageHeader` (title + CTA)
2. `FilterBar` (optional)
3. `ContentCard` or `DataTableCard`
4. Loading / empty / error states (always present)

### Page templates

1. **List with filters + table** – most common
2. **Tabs + content**
3. **Direct table** (no filters)
4. **Fullscreen map with side panel**
5. **Grouped list by period/section**

---

## 7. Component rules

### Page header

- Title left-aligned, CTA right-aligned
- CTA always coral (`#F37A76`)

### Filters

- Compact visual, custom style (not generic Tailwind inputs)
- Search with `mdi-magnify` icon
- Filters use border via shadow + custom label (replicating legacy)
- Boolean filters: white container with light border, `4px` radius
- Responsive grid: `lg`/`md`/`sm` breakpoints

### Tables

- White background, no heavy shadow
- Header: light visual, strong typography
- Row actions: small icons. Delete never primary visual action
- Status chips standardized via `StatusChip`
- `TableSwitch` for extra columns (opt-in per page, not global)
- Boolean columns use `BooleanIcon` (`mdi-check-bold` true, `mdi-close-thick` false)

### Tabs

- Active: `#21566E`, `700`
- Inactive: `#999999`, `700`
- Slider: `#F37A76` (coral)

### Dialogs

- Simple, functional title
- Primary action: coral
- Secondary: gray
- Close via `X` when appropriate

### Sidebar

- Compact vertical navigation with icons
- Active item: left indicator bar (`4px`)
- Floating submenu with glassmorphism (blur + semi-transparent)
- User section fixed at bottom
- Map views: sidebar background changes to `#F5F5F5`

### Drawers

- `480px` for simple context / user details
- `970px` for complex operational context
- Overlays content (no resize)

### Snackbar

- Top-right for global errors
- Error variant in dark red
- Multiline support
- Production: friendly message + `request_id` (no raw JSON)
- Dev/staging: expandable technical details

---

## 8. Global states (mandatory on every data screen)

1. **Loading initial:** skeleton or placeholder (not spinner alone in large areas)
2. **Loading action:** button processing state, prevent double-click
3. **Recoverable error:** banner/card/snackbar with retry action
4. **Empty state:** differentiate "no data yet" vs "no results for filter" vs "prerequisite not met"
5. **No permission:** clear message without exposing disabled actions
6. **Filter required:** contextual message like "Apply a filter..."

---

## 9. Responsiveness

### Desktop

- Primary experience
- Fixed sidebar, full tables, inline filters
- Filter grid prioritizes wide distribution on `lg`

### Tablet

- Filters may break into two rows
- Sidebar may collapse to drawer
- Wide tables scroll horizontally

### Mobile

- Sidebar becomes drawer
- Stacked filters
- Tables may become responsive cards
- Dialogs respect viewport
- Title reduces to `20px`

---

## 10. Accessibility (minimum mandatory)

1. Acceptable contrast on text and buttons
2. Visible focus on interactive controls
3. Labels and placeholders do not replace semantic description
4. Action icons must have `aria-label`
5. Dialog must manage focus
6. Disabled states cannot depend only on color

---

## 11. Implementation order

Follow this order strictly – do not start with final pages:

1. **Phase 0:** Design tokens, Nunito font, typography scale, color utilities, status map
2. **Phase 1:** AppShell, Sidebar, SidebarItem, SidebarSubmenu, SidebarUser
3. **Phase 2:** Buttons (Primary, Secondary, Outlined, Icon), StatusChip, BooleanIcon, InfoBanner, Snackbar, Dialog, DrawerPanel
4. **Phase 3:** FilterBar, FilterInput, FilterSelect, FilterAutocomplete, FilterDateRange, FilterBoolean
5. **Phase 4:** DataTable, RowActions, EntityListCard, TableSwitch, EmptyState, ErrorState, LoadingState
6. **Phase 5:** PageHeader, TabsNav, page templates (list+filters, tabs+content, grouped list)
7. **Phase 6:** MapScreenLayout, MapFiltersPanel, MapFloatingAction, FloatingTotalBar
8. **Phase 7:** Domain components (AppointmentStatusChip, AppointmentFilters, GroupOfferCard, etc.)
9. **Phase 8:** Feature pages by module

---

## 12. Decisions already closed

1. **Board/Kanban:** NOT in initial scope. Only implement if explicitly requested.
2. **SVG assets:** Do not reuse legacy branding. Only neutral/functional icons validated for Properfy.
3. **TableSwitch:** Opt-in per page, not global.
4. **Snackbar:** No raw JSON in production.
5. **Status map:** `DONE` and `REJECTED` are mandatory in the design system.

---

## 13. Conventions for Claude Code

When you (Claude Code) implement or modify frontend code:

1. **Read the frontend documentation first:** `projeto-consolidado/frontend-system-spec.md`, `component-inventory.md`, `layout-behavior-rules.md`, `frontend-decisoes-finais.md`.
2. **Do not redesign freely** – preserve the visual language of the legacy system.
3. **Use design tokens** – no hardcoded colors without justification.
4. **Reuse base components** before creating page-specific variations.
5. **Implement all states** – loading, empty, error, permission on every data screen.
6. **Respect responsiveness** – desktop-first but tablet/mobile must not look improvised.
7. **Language: English** for all user-facing text (labels, messages, placeholders). Mock/seed data may retain Portuguese names.
8. **Types from `packages/shared`** for enums, IDs and shared schemas.
9. **If a rule is still open**, declare the assumption explicitly in your output.
10. **The frontend must NOT look like a generic Tailwind template.**

For complete visual specs, consult `projeto-consolidado/frontend-system-spec.md` and `projeto-consolidado/ui-system-atual.md`.
