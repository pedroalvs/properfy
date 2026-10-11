import type { BadgeProps } from '@/components/ui/Badge';

type BadgeTone = NonNullable<BadgeProps['tone']>;

/** Maps a persisted invoice status to the product 3-bucket badge (spec 032). */
export function invoiceStatusBadge(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'PENDING_REVIEW':
      return { label: 'Pending', tone: 'amber' };
    case 'CLOSED':
    case 'PAID':
      return { label: 'Approved', tone: 'green' };
    case 'VOID':
      return { label: 'Rejected', tone: 'red' };
    default:
      return { label: status, tone: 'gray' };
  }
}

/** Approved (downloadable) = CLOSED or PAID. */
export function isApproved(status: string): boolean {
  return status === 'CLOSED' || status === 'PAID';
}

export function formatInvoiceCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}
