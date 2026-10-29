# Phase 1 Data Model — X01

**No persistent data model.** This feature adds no entity, column, migration, API field or
tenant-scoped data. There is nothing to store and nothing to scope. The sections below document
the two **UI contracts** the feature defines, in place of a data model.

## UI Contract 1 — `NavItem` descriptor (`components/shell/Sidebar.tsx`)

```ts
interface NavSubmenuItem {
  icon: string;
  label: string;
  to: string;
  roles?: string[];        // mirrors the route AuthGuard exactly
}

interface NavItem {
  icon: string;
  label: string;
  to?: string;
  submenu?: NavSubmenuItem[];
  roles?: string[];
  flag?: string;           // 031 — CL_USER flag gate (unchanged)
  collapseIfSingle?: boolean;  // NEW — Dashboard group only
}

export const NAV_ITEMS: NavItem[];   // now exported (L-X01-03)
export function filterNavItems(
  items: NavItem[],
  role: string | undefined,
  clUserPermissions?: string[],      // third param now OPTIONAL
): NavItem[];
```

**`filterNavItems` rules** (after filtering children by role):

| Visible children | `collapseIfSingle` | Result |
|---|---|---|
| 0 | any | item discarded (current behaviour) |
| 1 | true | plain item `{ icon: item.icon, label: item.label, to: child.to }` (no `submenu`) |
| 1 | false/absent | group with 1 child (current behaviour — Users/Configuration unchanged) |
| ≥2 | any | group (`SidebarSubmenu`) |

**Dashboard group value** (canonical order; X01 ships the three non-future children):

```ts
{
  icon: 'mdi-view-dashboard-outline',
  label: 'Dashboard',
  collapseIfSingle: true,
  submenu: [
    { icon: 'mdi-view-dashboard-outline', label: 'Overview',  to: '/dashboard' },
    { icon: 'mdi-chart-line',             label: 'Analytics', to: '/analytics',          roles: [AM, OP, CL_ADMIN, CL_USER] },
    { icon: 'mdi-account-clock-outline',  label: 'Workload',  to: '/inspector-workload', roles: [AM, OP] },
  ],
}
```

Full canonical order (for future inserts, not scaffolded now): Overview · Live Day (F05) ·
Inspector notices (F02) · Analytics · Workload · Inspector performance (F07) · Goals & rewards (F08).

## UI Contract 2 — Back navigation components

```ts
// components/layout/BackButton.tsx (NEW)
interface BackButtonProps {
  to: string;                              // parent screen / fallback (may carry a query string)
  onClick?: (goBack: () => void) => void;  // override: called instead of navigating; receives goBack
  className?: string;
}

// components/layout/PageHeader.tsx (extended)
interface PageHeaderProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  children?: ReactNode;
  backTo?: string;                         // NEW — when set, renders <BackButton to={backTo} onClick={onBack}/>
  onBack?: (goBack: () => void) => void;   // NEW — override passed to BackButton; ignored without backTo
}

// hooks/useGoBack.ts (criterion changed; signature unchanged)
function useGoBack(fallbackPath: string): () => void;
```

**Invariants:**
- `BackButton` with `onClick` set calls **only** `onClick(goBack)` — it never navigates on its own.
  The page decides (open discard dialog, ignore during commit, or call the received `goBack`).
- `PageHeader` without `backTo` renders no `BackButton` and calls no router hook (works outside a
  router). `onBack` without `backTo` is ignored.
- A create page's own `useGoBack(BACK_TO)` and its `backTo={BACK_TO}` use the **same constant**.
- `backTo` must be reachable by every role that opens the sub-screen, else computed per role
  (`TenantDetailPage`).
