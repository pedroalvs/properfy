import { describe, it, expect } from 'vitest';
import {
  ServiceTypeFlowType,
  ServiceTypeStatus,
  PayoutType,
  PriceRuleStatus,
} from './service-type';

describe('ServiceTypeFlowType', () => {
  it('should have ROUTINE, INGOING, OUTGOING values', () => {
    expect(ServiceTypeFlowType.ROUTINE).toBe('ROUTINE');
    expect(ServiceTypeFlowType.INGOING).toBe('INGOING');
    expect(ServiceTypeFlowType.OUTGOING).toBe('OUTGOING');
  });

  it('should have exactly 3 flow types', () => {
    expect(Object.keys(ServiceTypeFlowType)).toHaveLength(3);
  });
});

describe('ServiceTypeStatus', () => {
  it('should have ACTIVE, INACTIVE values', () => {
    expect(ServiceTypeStatus.ACTIVE).toBe('ACTIVE');
    expect(ServiceTypeStatus.INACTIVE).toBe('INACTIVE');
  });

  it('should have exactly 2 statuses', () => {
    expect(Object.keys(ServiceTypeStatus)).toHaveLength(2);
  });
});

describe('PayoutType', () => {
  it('should have FIXED, PERCENTAGE values', () => {
    expect(PayoutType.FIXED).toBe('FIXED');
    expect(PayoutType.PERCENTAGE).toBe('PERCENTAGE');
  });

  it('should have exactly 2 types', () => {
    expect(Object.keys(PayoutType)).toHaveLength(2);
  });
});

describe('PriceRuleStatus', () => {
  it('should have ACTIVE, INACTIVE values', () => {
    expect(PriceRuleStatus.ACTIVE).toBe('ACTIVE');
    expect(PriceRuleStatus.INACTIVE).toBe('INACTIVE');
  });

  it('should have exactly 2 statuses', () => {
    expect(Object.keys(PriceRuleStatus)).toHaveLength(2);
  });
});
