import { describe, it, expect } from 'vitest';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';

describe('ServiceRegionEntity', () => {
  it('should require tenantId', () => {
    const entity = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Sydney CBD',
      geojson: {},
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(entity.tenantId).toBe('tenant-1');
    expect(entity.name).toBe('Sydney CBD');
    expect(entity.isActive()).toBe(true);
  });

  it('should report inactive status', () => {
    const entity = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'INACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(entity.isActive()).toBe(false);
  });
});
