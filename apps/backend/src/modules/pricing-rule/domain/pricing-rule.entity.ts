import { BaseEntity } from '../../../shared/domain/entity';
import type { PayoutType, PriceRuleStatus, BonusRule } from '@properfy/shared';

export interface PricingRuleProps {
  id: string;
  tenantId: string;
  currency: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: number;
  payoutType: PayoutType;
  payoutValue: number;
  bonusRuleJson: BonusRule | null;
  status: PriceRuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PricingRuleEntity extends BaseEntity {
  readonly tenantId: string;
  readonly currency: string;
  readonly serviceTypeId: string;
  readonly branchId: string | null;
  readonly priceAmount: number;
  readonly payoutType: PayoutType;
  readonly payoutValue: number;
  readonly bonusRuleJson: BonusRule | null;
  status: PriceRuleStatus;

  constructor(props: PricingRuleProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.currency = props.currency;
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
