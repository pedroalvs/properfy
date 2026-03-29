import { BaseEntity } from '../../../shared/domain/entity';
import type { RegionStatus } from '@properfy/shared';

export interface ServiceRegionProps {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: RegionStatus;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceRegionEntity extends BaseEntity {
  readonly name: string;
  readonly geojson: Record<string, unknown>;
  readonly color: string;
  status: RegionStatus;
  readonly createdByUserId: string | null;

  constructor(props: ServiceRegionProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.geojson = props.geojson;
    this.color = props.color;
    this.status = props.status;
    this.createdByUserId = props.createdByUserId;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
