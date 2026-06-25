import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class PricingRuleNotFoundError extends NotFoundError {
  constructor() {
    super('PRICING_RULE_NOT_FOUND', 'Pricing rule not found');
  }
}

export class PricingRuleDuplicateError extends ConflictError {
  constructor() {
    super(
      'PRICING_RULE_DUPLICATE',
      'A pricing rule already exists for this tenant, service type and branch combination',
    );
  }
}
