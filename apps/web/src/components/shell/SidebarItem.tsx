import { NavLink } from 'react-router-dom';

interface SidebarItemProps {
  icon: string;
  label: string;
  to: string;
}

export function SidebarItem({ icon, label, to }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative block w-sidebar px-1 py-2 text-center group ${
          isActive ? 'sidebar-active' : ''
        }`
      }
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          {/* Left indicator bar */}
          <span
            className={`absolute left-0 top-[-4px] h-[calc(100%+8px)] w-1 rounded-r transition-colors ${
              isActive ? 'bg-realty' : 'bg-transparent'
            }`}
          />
          <i
            className={`mdi ${icon} text-2xl transition-opacity ${
              isActive ? 'text-realty opacity-100' : 'opacity-65 group-hover:opacity-100 group-hover:text-realty'
            }`}
          />
        </>
      )}
    </NavLink>
  );
}
