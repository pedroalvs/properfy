export const PropertyType = {
  APARTMENT: 'APARTMENT',
  HOUSE: 'HOUSE',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  RURAL: 'RURAL',
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

export const GeocodingStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  MANUAL: 'MANUAL',
} as const;
export type GeocodingStatus = (typeof GeocodingStatus)[keyof typeof GeocodingStatus];
