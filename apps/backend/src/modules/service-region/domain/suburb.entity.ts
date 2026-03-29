import type { SuburbStatus } from '@properfy/shared';

export interface SuburbProps {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: SuburbStatus;
  createdAt: Date;
}

export class SuburbEntity {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly postcode: string | null;
  status: SuburbStatus;
  readonly createdAt: Date;

  constructor(props: SuburbProps) {
    this.id = props.id;
    this.name = props.name;
    this.city = props.city;
    this.state = props.state;
    this.country = props.country;
    this.postcode = props.postcode;
    this.status = props.status;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
