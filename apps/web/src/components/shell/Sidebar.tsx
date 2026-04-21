import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
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
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'mdi-view-dashboard-outline', label: 'Dashboard', to: '/dashboard' },
  { icon: 'mdi-calendar-month', label: 'Appointments', to: '/appointments' },
  { icon: 'mdi-home-city-outline', label: 'Properties', to: '/properties' },
  // Contacts is read-accessible to every role that can list appointments
  // (backend `ListAppointmentContactsUseCase` allows AM/OP/CL_ADMIN/CL_USER,
  // tenant-scoped for CL roles). Keeping it out of the admin "Users"
  // submenu — which is strictly AM/OP management tools — removes the
  // ambiguity we inherited: the route accepted CL but the sidebar hid
  // it. Create/update for contacts is still AM/OP/CL_ADMIN (spec 021);
  // CL_USER creates contacts inline during appointment creation. See
  // specs/DECISIONS.md DEC-001.
  { icon: 'mdi-account-multiple-outline', label: 'Contacts', to: '/tenant-contacts', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER] },
  {
    icon: 'mdi-account-group-outline',
    label: 'Users',
    roles: [UserRole.AM, UserRole.OP],
    submenu: [
      { icon: 'mdi-domain', label: 'Agencies', to: '/tenants', roles: [UserRole.AM, UserRole.OP] },
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
      { icon: 'mdi-map-marker-radius-outline', label: 'Service Regions', to: '/service-regions' },
      { icon: 'mdi-clock-outline', label: 'Time Slots', to: '/time-slots' },
      { icon: 'mdi-currency-usd', label: 'Pricing Rules', to: '/pricing-rules' },
      { icon: 'mdi-email-outline', label: 'Notification Templates', to: '/notification-templates' },
    ],
  },
  // CL_ADMIN audit access shipped with feature 020 (011#GAP-002).
  { icon: 'mdi-history', label: 'Audit Logs', to: '/audit-logs', roles: [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN] },
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

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const visibleItems = useMemo(() => filterNavItems(NAV_ITEMS, user?.role), [user?.role]);
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
      <div className={`flex items-center ${mobile ? 'justify-between border-b border-border-subtle px-4 py-4' : 'justify-center py-4'}`}>
        <span className="text-xl font-bold text-secondary">{mobile ? 'Properfy' : 'P'}</span>
      </div>

      <nav className={`flex flex-1 flex-col ${mobile ? 'gap-3 overflow-y-auto px-3 py-4' : 'items-center gap-1 py-4'}`}>
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
