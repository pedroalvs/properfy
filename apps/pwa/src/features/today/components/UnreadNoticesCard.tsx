import { Link } from 'react-router-dom';
import { ChevronRight, Megaphone } from 'lucide-react';

interface UnreadNoticesCardProps {
  count: number;
}

/** Card linking to the announcements inbox; renders only when there are unread notices. */
export function UnreadNoticesCard({ count }: UnreadNoticesCardProps) {
  if (count <= 0) return null;
  const label = count === 1 ? '1 unread announcement' : `${count} unread announcements`;
  return (
    <Link
      to="/profile/announcements"
      className="flex min-h-touch items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
      data-testid="unread-notices-card"
    >
      <Megaphone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex-1 text-sm font-semibold text-foreground">{label}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
