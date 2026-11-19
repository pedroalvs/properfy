import type { EarlyAccessParams } from './early-access';

/**
 * Port the marketplace use cases depend on to learn an inspector's early-access
 * window for a request. Implemented by the inspector-program adapter
 * (`OfferEarlyAccessPolicy`) so the service-group module stays independent of
 * inspector-program. `resolve` returns `null` when no window applies (disabled,
 * viewer qualifies, no snapshot, or not yet activated).
 */
export interface IOfferEarlyAccessPolicy {
  resolve(inspectorId: string, now: Date): Promise<EarlyAccessParams | null>;
}
