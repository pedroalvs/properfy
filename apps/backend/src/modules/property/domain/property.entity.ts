import { BaseEntity } from '../../../shared/domain/entity';
import { buildNormalizedAddressKey } from '../../../shared/domain/normalize-address';
import type { PropertyType, GeocodingStatus, PropertyRules } from '@properfy/shared';
import type { GeocodingResult } from './geocoding.service';

export interface PropertyProps {
  id: string;
  tenantId: string;
  branchId: string | null;
  propertyCode: string;
  type: PropertyType;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  geocodingStatus: GeocodingStatus;
  notes: string | null;
  rulesJson: PropertyRules;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class PropertyEntity extends BaseEntity {
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly propertyCode: string;
  readonly type: PropertyType;
  readonly street: string;
  readonly addressLine2: string | null;
  readonly suburb: string;
  readonly postcode: string;
  readonly state: string;
  readonly country: string;
  lat: number | null;
  lng: number | null;
  geocodingStatus: GeocodingStatus;
  readonly notes: string | null;
  readonly rulesJson: Record<string, unknown>;
  readonly deletedAt: Date | null;

  constructor(props: PropertyProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.branchId = props.branchId;
    this.propertyCode = props.propertyCode;
    this.type = props.type;
    this.street = props.street;
    this.addressLine2 = props.addressLine2;
    this.suburb = props.suburb;
    this.postcode = props.postcode;
    this.state = props.state;
    this.country = props.country;
    this.lat = props.lat;
    this.lng = props.lng;
    this.geocodingStatus = props.geocodingStatus;
    this.notes = props.notes;
    this.rulesJson = props.rulesJson;
    this.deletedAt = props.deletedAt;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  needsGeocoding(): boolean {
    return this.geocodingStatus === 'PENDING';
  }

  /**
   * Apply the outcome of a geocoding lookup to this entity. A coordinate result
   * sets SUCCESS; a null result (address not found) sets FAILED. Used by the
   * create flow to geocode synchronously before persisting.
   */
  applyGeocodingResult(result: GeocodingResult | null): void {
    if (result) {
      this.lat = result.lat;
      this.lng = result.lng;
      this.geocodingStatus = 'SUCCESS';
    } else {
      this.lat = null;
      this.lng = null;
      this.geocodingStatus = 'FAILED';
    }
  }

  get fullAddress(): string {
    const parts = [this.street];
    if (this.addressLine2) parts.push(this.addressLine2);
    parts.push(this.suburb, this.state, this.postcode, this.country);
    return parts.join(', ');
  }

  /** Derived, never stale within a loaded instance — see `buildNormalizedAddressKey`
   * for why this must stay in lockstep with the Prisma repository and the
   * appointment-import resolver. */
  get normalizedAddressKey(): string {
    return buildNormalizedAddressKey({
      street: this.street,
      addressLine2: this.addressLine2,
      suburb: this.suburb,
      state: this.state,
      postcode: this.postcode,
    });
  }
}
