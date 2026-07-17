/**
 * One raw spreadsheet row of a property import, keyed by internal field name
 * (header mapping happens in the parser, values arrive trimmed or null).
 * Kept in the domain layer so both the application-layer resolver and the
 * infrastructure-layer parser can depend on it.
 */
export interface RawPropertyImportRow {
  propertyCode: string | null;
  type: string | null;
  street: string | null;
  addressLine2: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
}
