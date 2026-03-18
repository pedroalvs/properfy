import { GeocodingStatus } from '@properfy/shared';
import { GEOCODING_STATUS_MAP } from '@/lib/status-colors';

interface GeocodingStatusBadgeProps {
  status: GeocodingStatus;
  size?: 'sm' | 'md';
}

export function GeocodingStatusBadge({ status, size = 'md' }: GeocodingStatusBadgeProps) {
  const style = GEOCODING_STATUS_MAP[status];

  const iconMap: Record<GeocodingStatus, { icon: string; animate?: boolean }> = {
    [GeocodingStatus.PENDING]: { icon: 'mdi-loading', animate: true },
    [GeocodingStatus.SUCCESS]: { icon: 'mdi-map-marker' },
    [GeocodingStatus.FAILED]: { icon: 'mdi-alert-circle' },
    [GeocodingStatus.MANUAL]: { icon: 'mdi-map-marker-check' },
  };

  const { icon, animate } = iconMap[status];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded font-medium ${sizeClass}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      <i className={`mdi ${icon} ${animate ? 'mdi-spin' : ''}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
