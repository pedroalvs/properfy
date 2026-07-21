import type { IntegrationDetail } from '@properfy/shared';

export function sourceBadge(detail: IntegrationDetail): { label: string; className: string } {
  if (!detail.enabled) {
    return { label: 'Disabled', className: 'bg-warning/10 text-warning' };
  }
  if (detail.source === 'database') {
    return { label: 'Configured (hub)', className: 'bg-success/10 text-success' };
  }
  if (detail.source === 'env') {
    return { label: 'Configured (environment)', className: 'bg-info/10 text-info' };
  }
  return { label: 'Not configured', className: 'bg-error/10 text-error' };
}
