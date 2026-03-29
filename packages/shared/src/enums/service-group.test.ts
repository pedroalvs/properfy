import { describe, it, expect } from 'vitest';
import { ServiceGroupStatus, PriorityMode } from './service-group';

describe('ServiceGroupStatus', () => {
  it('should have DRAFT, PUBLISHED, ACCEPTED, REJECTED, CANCELLED values', () => {
    expect(ServiceGroupStatus.DRAFT).toBe('DRAFT');
    expect(ServiceGroupStatus.PUBLISHED).toBe('PUBLISHED');
    expect(ServiceGroupStatus.ACCEPTED).toBe('ACCEPTED');
    expect(ServiceGroupStatus.REJECTED).toBe('REJECTED');
    expect(ServiceGroupStatus.CANCELLED).toBe('CANCELLED');
  });

  it('should have exactly 5 statuses', () => {
    expect(Object.keys(ServiceGroupStatus)).toHaveLength(5);
  });

  it('should not have ASSIGNED status', () => {
    expect('ASSIGNED' in ServiceGroupStatus).toBe(false);
  });

  it('should not have COMPLETED status', () => {
    expect('COMPLETED' in ServiceGroupStatus).toBe(false);
  });
});

describe('PriorityMode', () => {
  it('should have STANDARD, PRIORITY_24H values', () => {
    expect(PriorityMode.STANDARD).toBe('STANDARD');
    expect(PriorityMode.PRIORITY_24H).toBe('PRIORITY_24H');
  });

  it('should have exactly 2 modes', () => {
    expect(Object.keys(PriorityMode)).toHaveLength(2);
  });

  it('should not have URGENT mode', () => {
    expect('URGENT' in PriorityMode).toBe(false);
  });
});
