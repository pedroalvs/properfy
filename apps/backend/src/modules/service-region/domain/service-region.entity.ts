import { BaseEntity } from '../../../shared/domain/entity';
import type { RegionStatus } from '@properfy/shared';
import type { SuburbProps } from './suburb.entity';

export interface ServiceRegionProps {
  id: string;
  name: string;
  state: string;
  country: string;
  status: RegionStatus;
  suburbs: SuburbProps[];
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceRegionEntity extends BaseEntity {
  readonly name: string;
  readonly state: string;
  readonly country: string;
  status: RegionStatus;
  readonly suburbs: SuburbProps[];

  constructor(props: ServiceRegionProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.state = props.state;
    this.country = props.country;
    this.status = props.status;
    this.suburbs = props.suburbs;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
