/** Maps a persisted invoice status to the product 3-bucket badge (spec 032). */
export function invoiceStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'PENDING_REVIEW':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case 'CLOSED':
    case 'PAID':
      return { label: 'Approved', className: 'bg-green-100 text-green-800' };
    case 'VOID':
      return { label: 'Rejected', className: 'bg-red-100 text-red-800' };
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700' };
  }
}

/** Approved (downloadable) = CLOSED or PAID. */
export function isApproved(status: string): boolean {
  return status === 'CLOSED' || status === 'PAID';
}

export function formatInvoiceCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}
