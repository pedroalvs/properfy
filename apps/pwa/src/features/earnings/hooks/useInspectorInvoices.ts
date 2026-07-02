import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost, useListQuery, useDetailQuery } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';

/**
 * Inspector Property Invoice hooks for the PWA (spec 032). The request-flow endpoints return raw
 * bodies; the billing list/detail/download endpoints use the standard success/paginated envelope.
 */

export interface AvailablePeriod {
  periodType: string;
  periodStart: string;
  periodEnd: string;
}
export interface AvailablePeriodsResponse {
  billingCycle: string;
  periods: AvailablePeriod[];
}
export interface InvoicePreview {
  periodType: string;
  periodStart: string;
  periodEnd: string;
  payoutCount: number;
  totalAmount: number;
  currency: string | null;
}
export interface RequestInvoiceResult {
  invoiceId: string;
  status: string;
  totalAmount: number;
  currency: string;
  payoutCount: number;
  periodStart: string;
  periodEnd: string;
}
export interface InvoiceSnapshotLine {
  serviceDate: string;
  appointmentCode: string;
  propertyAddress: string | null;
  serviceType: string | null;
  amount: number;
  agencyName: string | null;
  branchName: string | null;
}
export interface MyInvoice {
  id: string;
  invoiceNumberDisplay: string | null;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  status: string;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}
export interface MyInvoiceDetail extends MyInvoice {
  lineItemsSnapshot: InvoiceSnapshotLine[] | null;
  notes: string | null;
}

export function useAvailablePeriods() {
  return useQuery<AvailablePeriodsResponse, ApiError>({
    queryKey: ['inspector-invoice-periods'],
    queryFn: () => apiGet<AvailablePeriodsResponse>('/v1/inspector/invoices/available-periods', { count: '6' }),
  });
}

export function usePreviewInvoice(period: AvailablePeriod | null) {
  return useQuery<InvoicePreview, ApiError>({
    queryKey: ['inspector-invoice-preview', period?.periodStart ?? '', period?.periodEnd ?? ''],
    queryFn: () => apiGet<InvoicePreview>('/v1/inspector/invoices/preview', {
      periodStart: period!.periodStart,
      periodEnd: period!.periodEnd,
    }),
    enabled: !!period,
  });
}

export function useRequestInvoice() {
  return useMutation<RequestInvoiceResult, ApiError, { periodStart: string; periodEnd: string }>({
    mutationFn: (body) => apiPost<RequestInvoiceResult>('/v1/inspector/invoices/request', body),
  });
}

export function useMyInvoices() {
  return useListQuery<{ data: MyInvoice[]; pagination: { total: number } }>(
    ['my-invoices'],
    '/v1/billing/invoices',
    { pageSize: '50', sortBy: 'createdAt', sortOrder: 'desc' },
  );
}

export function useMyInvoiceDetail(id: string | undefined) {
  return useDetailQuery<MyInvoiceDetail>(['my-invoice', id], `/v1/billing/invoices/${id}`, { enabled: !!id });
}

/**
 * Opens the presigned PDF URL for an approved invoice in a new tab.
 *
 * iOS Safari blocks window.open() called AFTER an await (it's considered disconnected from the user
 * gesture), so the tab is opened synchronously here — before fetching the signed URL — and then
 * pointed at the URL once it resolves. Note window.open(..., 'noopener') returns null, which would
 * break this pattern, so we null out `opener` manually for the same reverse-tabnabbing protection.
 */
export async function downloadInvoice(id: string): Promise<void> {
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  try {
    const res = await apiGet<{ data: { downloadUrl: string; expiresAt: string } }>(`/v1/billing/invoices/${id}/download`);
    if (win && !win.closed) {
      win.location.href = res.data.downloadUrl;
    } else {
      // Popup was blocked entirely — fall back to same-tab navigation to the signed URL.
      window.location.href = res.data.downloadUrl;
    }
  } catch (err) {
    win?.close();
    throw err;
  }
}
