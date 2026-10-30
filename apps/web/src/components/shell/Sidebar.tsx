import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import { SidebarSubmenu } from './SidebarSubmenu';
import { SidebarUser } from './SidebarUser';
import { SidebarUserMenu } from './SidebarUserMenu';

interface NavSubmenuItem {
  icon: string;
  label: string;
  to: string;
  roles?: string[];
}

interface NavItem {
  icon: string;
  label: string;
  to?: string;
  submenu?: NavSubmenuItem[];
  roles?: string[];
  /** 031 — additional CL_USER flag gate (only applies to CL_USER; others pass). */
  flag?: string;
  /**
   * When a group has exactly one visible child, collapse it to a plain item pointing at that
   * child. Used only by the Dashboard group so the INSP (Overview only) sees a plain "Dashboard"
   * link while other roles see the group.
   */
  collapseIfSingle?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // Dashboard panel group. Canonical child order (operations first, then analysis):
  // Overview · Live Day (F05) · Inspector notices (F02) · Analytics · Workload ·
  // Inspector performance (F07) · Goals & rewards (F08). Later features insert their child at
  // its position; X01 ships only Overview, Analytics and Workload. Each child's roles mirror
  // its route AuthGuard exactly; collapseIfSingle gives a plain "Dashboard" link to a role that
  // can see only one child (INSP).
  {
    icon: 'mdi-view-dashboard-outline',
    label: 'Dashboard',
    collapseIfSingle: true,
    submenu: [
      { icon: 'mdi-view-dashboard-outline', label: 'Overview', to: '/dashboard' },
      { icon: 'mdi-bullhorn-outline', label: 'Inspector notices', to: '/inspector-notices', roles: [UserRole.AM, UserRole.OP] },
      { icon: 'mdi-chart-line', label: 'Analytics', to: '/analytics', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER] },
      { icon: 'mdi-account-clock-outline', label: 'Workload', to: '/inspector-workload', roles: [UserRole.AM, UserRole.OP] },
    ],
  },
  // Map-first navigation: the map is the single entry point for appointments
  // and service groups. The lists are reached from the map's "List view"
  // toggle (appointments mode -> /appointments, groups mode -> /service-groups).
  { icon: 'mdi-map-outline', label: 'Map', to: '/map', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER] },
  { icon: 'mdi-home-city-outline', label: 'Properties', to: '/properties' },
  // Unified contacts registry (specs 022 + 023). The legacy /tenant-contacts
  // confirmation board was retired in 023; per-appointment confirmation
  // status now lives inline on /appointments and on each contact's Relations
  // tab at /contacts/:id.
  { icon: 'mdi-account-multiple-outline', label: 'Contacts', to: '/contacts', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER] },
  {
    icon: 'mdi-account-group-outline',
    label: 'Users',
    roles: [UserRole.AM, UserRole.OP],
    submenu: [
      { icon: 'mdi-domain', label: 'Agencies', to: '/tenants', roles: [UserRole.AM, UserRole.OP] },
      { icon: 'mdi-badge-account-outline', label: 'Inspectors', to: '/inspectors', roles: [UserRole.AM, UserRole.OP] },
      { icon: 'mdi-apps', label: 'Apps', to: '/apps', roles: [UserRole.AM, UserRole.OP] },
      { icon: 'mdi-shield-account-outline', label: 'Users', to: '/users', roles: [UserRole.AM, UserRole.OP] },
    ],
  },
  { icon: 'mdi-store-outline', label: 'Marketplace', to: '/marketplace', roles: [UserRole.INSP] },
  { icon: 'mdi-calendar-clock-outline', label: 'Availability', to: '/availability-slots', roles: [UserRole.AM, UserRole.OP] },
  { icon: 'mdi-bank-outline', label: 'Financial', to: '/financial', roles: [UserRole.AM, UserRole.OP] },
  // 031 — Agency financial surface: CL_ADMIN always; CL_USER gated by `view_financials`.
  { icon: 'mdi-bank-outline', label: 'Financial', to: '/my-financial', roles: [UserRole.CL_ADMIN, UserRole.CL_USER], flag: 'view_financials' },
  // Agency-visible surface: CL_ADMIN always; CL_USER gated by `view_financials`
  // (the Financial report is one of the types an agency can generate).
  { icon: 'mdi-chart-bar', label: 'Reports', to: '/reports', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER], flag: 'view_financials' },
  {
    icon: 'mdi-cog-outline',
    label: 'Configuration',
    roles: [UserRole.AM, UserRole.OP],
    submenu: [
      { icon: 'mdi-clipboard-list-outline', label: 'Service Types', to: '/service-types', roles: [UserRole.AM] },
      { icon: 'mdi-map-marker-radius-outline', label: 'Service Regions', to: '/service-regions' },
      { icon: 'mdi-currency-usd', label: 'Pricing Rules', to: '/pricing-rules' },
      { icon: 'mdi-email-outline', label: 'Notification Templates', to: '/notification-templates' },
      { icon: 'mdi-connection', label: 'Integrations', to: '/integrations', roles: [UserRole.AM] },
    ],
  },
  // CL_ADMIN audit access shipped with feature 020 (011#GAP-002).
  { icon: 'mdi-history', label: 'Audit Logs', to: '/audit-logs', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN] },
];

export function filterNavItems(
  items: NavItem[],
  role: string | undefined,
  clUserPermissions?: string[],
): NavItem[] {
  const flagOk = (item: NavItem): boolean => {
    if (!item.flag) return true;
    // The flag only gates CL_USER; other roles pass if their role is allowed.
    if (role !== 'CL_USER') return true;
    return (clUserPermissions ?? []).includes(item.flag);
  };
  return items
    .filter((item) => (!item.roles || (role && item.roles.includes(role))) && flagOk(item))
    .map((item) => {
      if (!item.submenu) return item;
      const filteredSubmenu = item.submenu.filter(
        (sub) => !sub.roles || (role && sub.roles.includes(role)),
      );
      const [firstChild] = filteredSubmenu;
      if (!firstChild) return null;
      // A collapseIfSingle group with one visible child becomes a plain item pointing at it.
      if (filteredSubmenu.length === 1 && item.collapseIfSingle) {
        return { icon: item.icon, label: item.label, to: firstChild.to };
      }
      return { ...item, submenu: filteredSubmenu };
    })
    .filter(Boolean) as NavItem[];
}

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const clFlagsKey = (user?.clUserPermissions ?? []).join(',');
  const visibleItems = useMemo(
    () => filterNavItems(NAV_ITEMS, user?.role, user?.clUserPermissions),
    // clFlagsKey tracks clUserPermissions contents for memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role, clFlagsKey],
  );
  const isMapRoute = pathname.includes('/map');

  return (
    <aside
      className={
        mobile
          ? 'flex h-full min-h-full w-full min-w-0 flex-col bg-white'
          : `fixed left-0 top-0 z-30 flex h-screen w-sidebar flex-col ${isMapRoute ? 'bg-[#F5F5F5]' : 'bg-transparent'}`
      }
      data-testid="sidebar"
    >
      <div className={cn('flex items-center', mobile ? 'justify-between border-b border-border-subtle px-4 py-4' : 'justify-center py-4')}>
        {mobile ? (
          <div className="flex items-center gap-2">
            <img src="/images/properfy-icon-square.png" alt="Properfy" className="h-8 w-8 object-contain" />
            <span className="font-poppins text-base font-semibold text-secondary">Properfy</span>
          </div>
        ) : (
          <img src="/images/properfy-icon-square.png" alt="Properfy" className="h-8 w-8 object-contain" />
        )}
      </div>

      <nav className={cn('flex flex-1 flex-col', mobile ? 'gap-3 overflow-y-auto px-3 py-4' : 'items-center gap-1 overflow-y-auto py-4 min-h-0')}>
        {visibleItems.map((item) =>
          item.submenu ? (
            <SidebarSubmenu
              key={item.label}
              icon={item.icon}
              label={item.label}
              items={item.submenu}
              mobile={mobile}
              onNavigate={onNavigate}
            />
          ) : (
            <SidebarItem
              key={item.to}
              icon={item.icon}
              label={item.label}
              to={item.to!}
              mobile={mobile}
              onNavigate={onNavigate}
            />
          ),
        )}
      </nav>

      {mobile ? <SidebarUserMenu mobile onNavigate={onNavigate} /> : <SidebarUser />}
    </aside>
  );
}
