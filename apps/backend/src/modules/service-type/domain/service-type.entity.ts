import { BaseEntity } from '../../../shared/domain/entity';
import type { ServiceTypeFlowType, ServiceTypeStatus } from '@properfy/shared';

export interface ServiceTypeProps {
  id: string;
  code: string;
  name: string;
  flowType: ServiceTypeFlowType;
  requiresRentalTenantConfirmation: boolean;
  status: ServiceTypeStatus;
  /** Expected minutes at each stop of this type; the day-plan optimizer adds it to travel. */
  defaultDurationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceTypeEntity extends BaseEntity {
  readonly code: string;
  readonly name: string;
  readonly flowType: ServiceTypeFlowType;
  readonly requiresRentalTenantConfirmation: boolean;
  status: ServiceTypeStatus;
  defaultDurationMinutes: number;

  constructor(props: ServiceTypeProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.code = props.code;
    this.name = props.name;
    this.flowType = props.flowType;
    this.requiresRentalTenantConfirmation = props.requiresRentalTenantConfirmation;
    this.status = props.status;
    this.defaultDurationMinutes = props.defaultDurationMinutes;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
