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
      { icon: 'mdi-account-multiple-outline', label: 'Tenants', to: '/tenants' },
      { icon: 'mdi-badge-account-outline', label: 'Inspectors', to: '/inspectors' },
      { icon: 'mdi-shield-account-outline', label: 'Users', to: '/users' },
    ],
  },
  { icon: 'mdi-office-building-marker', label: 'Service Groups', to: '/service-groups' },
  { icon: 'mdi-bank-outline', label: 'Financial', to: '/financial' },
  { icon: 'mdi-chart-bar', label: 'Reports', to: '/reports' },
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
