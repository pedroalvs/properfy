import type { PropertyType } from '@properfy/shared';
import type { MarketplaceOfferProperty } from '../types';

/**
 * Property type → Material Design Icon class. Kept in the PWA rather than in
 * `packages/shared` because `@mdi/font` is a PWA-only dependency; web renders
 * the same concept with its own icon choices.
 */
export const PROPERTY_TYPE_ICONS: Record<PropertyType, string> = {
  APARTMENT: 'mdi-office-building-outline',
  HOUSE: 'mdi-home-outline',
};

/** Distinct property types in a group, first-seen order, nulls dropped. */
export function distinctPropertyTypes(
  properties: readonly MarketplaceOfferProperty[],
): PropertyType[] {
  const seen = new Set<PropertyType>();
  for (const property of properties) {
    if (property.propertyType) seen.add(property.propertyType);
  }
  return [...seen];
}

/** "<street>, <suburb>", degrading to whichever part is present. */
export function formatOfferAddress(property: MarketplaceOfferProperty): string {
  return [property.street, property.suburb].filter(Boolean).join(', ');
}

export interface OfferAddressSummary {
  /** The one address the card shows; '' when the offer carries none. */
  primary: string;
  /** How many further properties the group holds, for the "+N more" line. */
  remaining: number;
}

/**
 * The card shows one full address and a count of the rest (doc §7.2 asks for a
 * full address; a group can hold several). Blanked entries — a missing or
 * soft-deleted property — are skipped when choosing which address to show but
 * still counted, because they are real jobs in the group.
 *
 * `suburbs` is the fallback for an offer whose properties are all blank.
 */
export function pickOfferAddresses(
  properties: readonly MarketplaceOfferProperty[],
  suburbs: readonly string[],
): OfferAddressSummary {
  const primary = properties.map(formatOfferAddress).find(Boolean);

  if (!primary) {
    return { primary: suburbs.filter(Boolean).join(' · '), remaining: 0 };
  }

  return { primary, remaining: Math.max(0, properties.length - 1) };
}
