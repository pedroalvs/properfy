import type { Prisma } from '@prisma/client';

/**
 * Port (billing domain) for the reward side of the inspector-invoice lifecycle. Implemented
 * by the inspector-program module, so billing never imports the reward repository (Clean
 * Architecture; mirrors F08-2 `IOfferEarlyAccessPolicy`). Every method runs inside the
 * caller's transaction so the reward update commits atomically with the invoice write.
 *
 * All methods are no-ops when the invoice carries no bonus (zero matching rewards), so the
 * existing billing flows are unaffected when the inspector-program module is not wired.
 */
export interface IRewardAwardInvoiceSync {
  /**
   * Link the given approved rewards to the invoice at close (`inspector_invoice_id`).
   * Updates only rewards still `APPROVED` with no invoice link; returns the number updated,
   * so the caller can detect a concurrent change (`INVOICE_LINES_CHANGED`).
   */
  linkToInvoice(tx: Prisma.TransactionClient, invoiceId: string, rewardAwardIds: string[]): Promise<number>;
  /** Mark every `APPROVED` reward on the invoice `PAID` with the invoice's paid_at. */
  markPaidForInvoice(tx: Prisma.TransactionClient, invoiceId: string, paidAt: Date): Promise<void>;
  /** Return every `PAID` reward on the invoice to `APPROVED` (clear paid_at, keep the link). */
  revertPaidForInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void>;
}
