import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';
import type { PrismaClient } from '@prisma/client';

function createMockPrisma() {
  return {
    serviceRegion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    inspectorRegion: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  } as unknown as PrismaClient;
}

function makeRegionEntity(overrides: Partial<ConstructorParameters<typeof ServiceRegionEntity>[0]> = {}): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: 'region-1',
    tenantId: 'tenant-1',
    name: 'Sydney CBD',
    geojson: { type: 'Polygon', coordinates: [[[151.2, -33.8], [151.3, -33.8], [151.3, -33.9], [151.2, -33.9], [151.2, -33.8]]] },
    color: '#3b82f6',
    status: 'ACTIVE',
    createdByUserId: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('PrismaServiceRegionRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: PrismaServiceRegionRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new PrismaServiceRegionRepository(prisma as unknown as PrismaClient);
  });

  describe('save', () => {
    it('should insert region with ST_SetSRID(ST_GeomFromGeoJSON(...)) for geom population', async () => {
      const region = makeRegionEntity();
      (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await repo.save(region);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      // Verify the raw SQL template was called (tagged template literal produces array)
      const callArgs = (prisma.$executeRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      // The first argument of a tagged template is the strings array
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('INSERT INTO service_regions');
      expect(joinedSql).toContain('ST_SetSRID(ST_GeomFromGeoJSON(');
    });
  });

  describe('update', () => {
    it('should update geom via raw SQL when geojson is provided', async () => {
      (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await repo.update('region-1', 'tenant-1', {
        geojson: { type: 'Polygon', coordinates: [[[151.2, -33.8], [151.3, -33.8], [151.3, -33.9], [151.2, -33.9], [151.2, -33.8]]] },
      });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const callArgs = (prisma.$executeRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('UPDATE service_regions');
      expect(joinedSql).toContain('ST_SetSRID(ST_GeomFromGeoJSON(');
    });

    it('should use Prisma updateMany when geojson is not provided', async () => {
      (prisma.serviceRegion.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      await repo.update('region-1', 'tenant-1', { name: 'New Name' });

      expect(prisma.serviceRegion.updateMany).toHaveBeenCalledWith({
        where: { id: 'region-1', tenant_id: 'tenant-1' },
        data: { name: 'New Name' },
      });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('resolveRegionsForAppointments', () => {
    it('should return empty array for empty appointment ids', async () => {
      const result = await repo.resolveRegionsForAppointments('tenant-1', []);
      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should execute spatial query with ST_Intersects and map results', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          region_id: 'region-1',
          region_name: 'Sydney CBD',
          color: '#3b82f6',
          matched_appointment_ids: ['apt-1', 'apt-2'],
        },
      ]);

      const result = await repo.resolveRegionsForAppointments('tenant-1', ['apt-1', 'apt-2', 'apt-3']);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const callArgs = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('ST_Intersects');
      expect(joinedSql).toContain('sr.geom IS NOT NULL');
      expect(joinedSql).not.toContain('ST_Contains');

      expect(result).toEqual([
        {
          regionId: 'region-1',
          regionName: 'Sydney CBD',
          color: '#3b82f6',
          matchedAppointmentIds: ['apt-1', 'apt-2'],
        },
      ]);
    });

    it('should match the tenant region AND global regions (tenant_id IS NULL), ACTIVE only', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await repo.resolveRegionsForAppointments('tenant-1', ['apt-1']);

      const callArgs = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('sr.tenant_id');
      // Global regions (tenant_id IS NULL) resolve for any tenant's appointments
      expect(joinedSql).toContain('sr.tenant_id IS NULL');
      expect(joinedSql).toContain("sr.status = 'ACTIVE'");
    });
  });

  describe('findContainingPoint', () => {
    it('should execute spatial query with ST_Intersects and ST_MakePoint', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'region-1',
          tenant_id: 'tenant-1',
          name: 'Sydney CBD',
          geojson: { type: 'Polygon', coordinates: [[[151.2, -33.8], [151.3, -33.8], [151.3, -33.9], [151.2, -33.9], [151.2, -33.8]]] },
          color: '#3b82f6',
          status: 'ACTIVE',
          created_by_user_id: 'user-1',
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        },
      ]);

      const result = await repo.findContainingPoint('tenant-1', -33.85, 151.25);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const callArgs = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('ST_Intersects');
      expect(joinedSql).toContain('ST_MakePoint');
      expect(joinedSql).toContain('ST_SetSRID');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(ServiceRegionEntity);
      expect(result[0].id).toBe('region-1');
      expect(result[0].name).toBe('Sydney CBD');
    });

    it('should return empty array when no regions contain the point', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await repo.findContainingPoint('tenant-1', 0, 0);

      expect(result).toEqual([]);
    });

    it('should scope by tenant and ACTIVE status', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await repo.findContainingPoint('tenant-1', -33.85, 151.25);

      const callArgs = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain("status = 'ACTIVE'");
      expect(joinedSql).toContain('tenant_id');
      expect(joinedSql).toContain('geom IS NOT NULL');
    });
  });

  describe('findPropertyIdsInInspectorRegions', () => {
    it('should use ST_Intersects for spatial matching', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'prop-1' }]);

      const result = await repo.findPropertyIdsInInspectorRegions('inspector-1');

      const callArgs = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
      const sqlStrings = callArgs[0];
      const joinedSql = Array.isArray(sqlStrings) ? sqlStrings.join('?') : String(sqlStrings);
      expect(joinedSql).toContain('ST_Intersects');
      expect(joinedSql).not.toContain('ST_Contains');
      expect(result).toEqual(['prop-1']);
    });
  });
});
