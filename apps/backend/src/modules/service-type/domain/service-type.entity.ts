import { BaseEntity } from '../../../shared/domain/entity';
import type { ServiceTypeFlowType, ServiceTypeStatus } from '@properfy/shared';

export interface ServiceTypeProps {
  id: string;
  code: string;
  name: string;
  flowType: ServiceTypeFlowType;
  requiresTenantConfirmation: boolean;
  status: ServiceTypeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceTypeEntity extends BaseEntity {
  readonly code: string;
  readonly name: string;
  readonly flowType: ServiceTypeFlowType;
  readonly requiresTenantConfirmation: boolean;
  status: ServiceTypeStatus;

  constructor(props: ServiceTypeProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.code = props.code;
    this.name = props.name;
    this.flowType = props.flowType;
    this.requiresTenantConfirmation = props.requiresTenantConfirmation;
    this.status = props.status;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
