import { PROPERTY_TYPE_LABELS, type PropertyType } from '@properfy/shared';

const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

export function formatPropertyType(type: PropertyType | string | null | undefined): string | undefined {
  if (!type) return undefined;
  return PROPERTY_TYPE_LABELS[type as PropertyType] ?? type;
}

export function formatArea(value: number | null | undefined): string | undefined {
  return value != null ? `${value} m²` : undefined;
}

export function formatRent(value: number | null | undefined): string | undefined {
  return value != null ? currencyFormatter.format(value) : undefined;
}

export function formatYesNo(value: boolean | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value ? 'Yes' : 'No';
}
