export const PropertyType = {
  APARTMENT: 'APARTMENT',
  HOUSE: 'HOUSE',
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

/** Human-readable labels for PropertyType — single source for web and PWA UIs. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
};

export const GeocodingStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  MANUAL: 'MANUAL',
} as const;
export type GeocodingStatus = (typeof GeocodingStatus)[keyof typeof GeocodingStatus];
