import { useMemo } from 'react';
import { formatAddressLabel } from '@/lib/address';

/** Minimal shape of a branch row needed to resolve its office address. */
interface BranchAddressItem {
  id: string;
  addressJson?: unknown;
}

/** Minimal shape of a property row needed to resolve its address. */
interface PropertyAddressItem {
  id: string;
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}

export interface AccessLocationPresets {
  /** The selected branch's office address, or null when unavailable. */
  agencyAddress: string | null;
  /** The selected property's address, or null when unavailable. */
  propertyAddress: string | null;
}

/**
 * Resolves the "Meeting Location" preset addresses for the appointment form.
 *
 * Both the agency (branch) and property addresses are already on the wire
 * (`GET /v1/branches` carries `addressJson`; `GET /v1/properties` carries the
 * structured address), so this reads them from the rows the form already
 * fetched — no extra request. A `null` address means that preset is not
 * offered (e.g. no property selected, or a legacy branch without an address).
 *
 * The value is persisted as a plain string snapshot; nothing downstream
 * changes (see apps/web/CLAUDE.md §12). Returns referentially stable values
 * (web CLAUDE.md §13.11).
 */
export function useAccessLocationPresets(params: {
  // May be undefined while the lists are still loading.
  branchItems: BranchAddressItem[] | undefined;
  propertyItems: PropertyAddressItem[] | undefined;
  branchId: string;
  propertyId: string;
  /** Edit-mode fallback when the property is not in the fetched list. */
  fallbackPropertyAddress?: string | null;
}): AccessLocationPresets {
  const { branchItems, propertyItems, branchId, propertyId, fallbackPropertyAddress } = params;

  return useMemo(() => {
    const branch = branchId ? branchItems?.find((b) => b.id === branchId) : undefined;
    const property = propertyId ? propertyItems?.find((p) => p.id === propertyId) : undefined;

    const agencyAddress = branch ? formatAddressLabel(branch.addressJson) : null;
    const propertyAddress =
      (property ? formatAddressLabel(property) : null) ?? (fallbackPropertyAddress?.trim() || null);

    return { agencyAddress, propertyAddress };
  }, [branchItems, propertyItems, branchId, propertyId, fallbackPropertyAddress]);
}
