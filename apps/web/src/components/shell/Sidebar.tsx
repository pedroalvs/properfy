import { SidebarItem } from './SidebarItem';
import { SidebarSubmenu } from './SidebarSubmenu';
import { SidebarUser } from './SidebarUser';

const NAV_ITEMS = [
  { icon: 'mdi-view-dashboard-outline', label: 'Dashboard', to: '/dashboard' },
  { icon: 'mdi-calendar-month', label: 'Appointments', to: '/appointments' },
  { icon: 'mdi-home-city-outline', label: 'Properties', to: '/properties' },
  {
    icon: 'mdi-account-group-outline',
    label: 'Users',
    submenu: [
      { icon: 'mdi-domain', label: 'Agencies', to: '/tenants' },
      { icon: 'mdi-account-multiple-outline', label: 'Contacts', to: '/tenant-contacts' },
      { icon: 'mdi-badge-account-outline', label: 'Inspectors', to: '/inspectors' },
      { icon: 'mdi-shield-account-outline', label: 'Users', to: '/users' },
    ],
  },
  { icon: 'mdi-office-building-marker', label: 'Service Groups', to: '/service-groups' },
  { icon: 'mdi-store-outline', label: 'Marketplace', to: '/marketplace' },
  { icon: 'mdi-calendar-clock-outline', label: 'Availability', to: '/availability-slots' },
  { icon: 'mdi-bank-outline', label: 'Financial', to: '/financial' },
  { icon: 'mdi-chart-bar', label: 'Reports', to: '/reports' },
  {
    icon: 'mdi-cog-outline',
    label: 'Configuration',
    submenu: [
      { icon: 'mdi-clipboard-list-outline', label: 'Service Types', to: '/service-types' },
      { icon: 'mdi-currency-usd', label: 'Pricing Rules', to: '/pricing-rules' },
      { icon: 'mdi-email-outline', label: 'Notification Templates', to: '/notification-templates' },
    ],
  },
  { icon: 'mdi-history', label: 'Audit Logs', to: '/audit-logs' },
];

export function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen w-sidebar flex-col bg-transparent"
      data-testid="sidebar"
    >
      <div className="flex items-center justify-center py-4">
        <span className="text-xl font-bold text-secondary">P</span>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-4 py-4">
        {NAV_ITEMS.map((item) =>
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
