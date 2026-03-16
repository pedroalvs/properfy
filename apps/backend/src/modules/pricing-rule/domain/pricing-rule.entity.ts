import { BaseEntity } from '../../../shared/domain/entity';
import type { PayoutType, PriceRuleStatus } from '@properfy/shared';

export interface PricingRuleProps {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: number;
  payoutType: PayoutType;
  payoutValue: number;
  bonusRuleJson: Record<string, unknown> | null;
  status: PriceRuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PricingRuleEntity extends BaseEntity {
  readonly tenantId: string;
  readonly serviceTypeId: string;
  readonly branchId: string | null;
  readonly priceAmount: number;
  readonly payoutType: PayoutType;
  readonly payoutValue: number;
  readonly bonusRuleJson: Record<string, unknown> | null;
  status: PriceRuleStatus;

  constructor(props: PricingRuleProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.serviceTypeId = props.serviceTypeId;
    this.branchId = props.branchId;
    this.priceAmount = props.priceAmount;
    this.payoutType = props.payoutType;
    this.payoutValue = props.payoutValue;
    this.bonusRuleJson = props.bonusRuleJson;
    this.status = props.status;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
