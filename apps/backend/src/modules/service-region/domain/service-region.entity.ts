import { BaseEntity } from '../../../shared/domain/entity';
import type { RegionStatus } from '@properfy/shared';

export interface ServiceRegionProps {
  id: string;
  tenantId: string | null;
  /** Assigned by the DB sequence on save, so absent when building a new region. */
  regionNumber?: number;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: RegionStatus;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceRegionEntity extends BaseEntity {
  readonly tenantId: string | null;
  /** Sequential display code. 0 until the DB sequence assigns it on save. */
  regionNumber: number;
  readonly name: string;
  readonly geojson: Record<string, unknown>;
  readonly color: string;
  status: RegionStatus;
  readonly createdByUserId: string | null;

  constructor(props: ServiceRegionProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.regionNumber = props.regionNumber ?? 0;
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
