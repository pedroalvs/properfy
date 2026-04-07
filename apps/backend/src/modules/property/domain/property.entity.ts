import { BaseEntity } from '../../../shared/domain/entity';
import type { PropertyType, GeocodingStatus, PropertyRules } from '@properfy/shared';

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
  readonly lat: number | null;
  readonly lng: number | null;
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

  get fullAddress(): string {
    const parts = [this.street];
    if (this.addressLine2) parts.push(this.addressLine2);
    parts.push(this.suburb, this.state, this.postcode, this.country);
    return parts.join(', ');
  }
}
