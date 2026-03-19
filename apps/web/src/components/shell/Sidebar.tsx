import { useMemo } from 'react';
import { UserRole } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import { SidebarSubmenu } from './SidebarSubmenu';
import { SidebarUser } from './SidebarUser';

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
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'mdi-view-dashboard-outline', label: 'Dashboard', to: '/dashboard' },
  { icon: 'mdi-calendar-month', label: 'Appointments', to: '/appointments' },
  { icon: 'mdi-home-city-outline', label: 'Properties', to: '/properties' },
  {
    icon: 'mdi-account-group-outline',
    label: 'Users',
    roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN],
    submenu: [
      { icon: 'mdi-domain', label: 'Agencies', to: '/tenants', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN] },
      { icon: 'mdi-account-multiple-outline', label: 'Contacts', to: '/tenant-contacts', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN] },
      { icon: 'mdi-badge-account-outline', label: 'Inspectors', to: '/inspectors', roles: [UserRole.AM, UserRole.OP] },
      { icon: 'mdi-shield-account-outline', label: 'Users', to: '/users', roles: [UserRole.AM, UserRole.OP] },
    ],
  },
  { icon: 'mdi-office-building-marker', label: 'Service Groups', to: '/service-groups', roles: [UserRole.AM, UserRole.OP] },
  { icon: 'mdi-store-outline', label: 'Marketplace', to: '/marketplace', roles: [UserRole.INSP] },
  { icon: 'mdi-calendar-clock-outline', label: 'Availability', to: '/availability-slots', roles: [UserRole.AM, UserRole.OP] },
  { icon: 'mdi-bank-outline', label: 'Financial', to: '/financial', roles: [UserRole.AM, UserRole.OP] },
  { icon: 'mdi-chart-bar', label: 'Reports', to: '/reports', roles: [UserRole.AM, UserRole.OP] },
  {
    icon: 'mdi-cog-outline',
    label: 'Configuration',
    roles: [UserRole.AM, UserRole.OP],
    submenu: [
      { icon: 'mdi-clipboard-list-outline', label: 'Service Types', to: '/service-types' },
      { icon: 'mdi-currency-usd', label: 'Pricing Rules', to: '/pricing-rules' },
      { icon: 'mdi-email-outline', label: 'Notification Templates', to: '/notification-templates' },
    ],
  },
  { icon: 'mdi-history', label: 'Audit Logs', to: '/audit-logs', roles: [UserRole.AM, UserRole.OP] },
];

function filterNavItems(items: NavItem[], role: string | undefined): NavItem[] {
  return items
    .filter((item) => !item.roles || (role && item.roles.includes(role)))
    .map((item) => {
      if (!item.submenu) return item;
      const filteredSubmenu = item.submenu.filter(
        (sub) => !sub.roles || (role && sub.roles.includes(role)),
      );
      if (filteredSubmenu.length === 0) return null;
      return { ...item, submenu: filteredSubmenu };
    })
    .filter(Boolean) as NavItem[];
}

export function Sidebar() {
  const { user } = useAuth();
  const visibleItems = useMemo(() => filterNavItems(NAV_ITEMS, user?.role), [user?.role]);

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen w-sidebar flex-col bg-transparent"
      data-testid="sidebar"
    >
      <div className="flex items-center justify-center py-4">
        <span className="text-xl font-bold text-secondary">P</span>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1 py-4">
        {visibleItems.map((item) =>
          item.submenu ? (
            <SidebarSubmenu
              key={item.label}
              icon={item.icon}
              label={item.label}
              items={item.submenu}
            />
          ) : (
            <SidebarItem
              key={item.to}
              icon={item.icon}
              label={item.label}
              to={item.to!}
            />
          ),
        )}
      </nav>

      <SidebarUser />
    </aside>
  );
}
