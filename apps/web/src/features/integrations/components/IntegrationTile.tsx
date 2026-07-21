import { Link } from 'react-router-dom';

interface IntegrationTileProps {
  to: string;
  name: string;
  caption: string;
  badge: { label: string; className: string };
  logo: React.ReactNode;
}

/** Hub tile: logo above the name, caption and status badge; the whole card links to the item's own page. */
export function IntegrationTile({ to, name, caption, badge, logo }: IntegrationTileProps) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col items-center gap-2 rounded bg-card-bg p-6 text-center shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <i
        className="mdi mdi-chevron-right absolute right-3 top-3 text-lg text-text-muted transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
      {logo}
      <span className="mt-1 text-sm font-bold text-text-primary">{name}</span>
      <span className="min-h-8 text-xs text-text-secondary">{caption}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    </Link>
  );
}
