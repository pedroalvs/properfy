import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeocodeWorker } from '../../../src/modules/property/infrastructure/workers/geocode.worker';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IGeocodingService } from '../../../src/modules/property/domain/geocoding.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';

function makeProperty(
  overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {},
): PropertyEntity {
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: null,
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('GeocodeWorker', () => {
  let propertyRepo: IPropertyRepository & {
    findById: ReturnType<typeof vi.fn>;
    existsById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countFailedGeocoding: ReturnType<typeof vi.fn>;
  };
  let geocodingService: { geocode: ReturnType<typeof vi.fn> };
  let auditService: AuditService;
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let worker: GeocodeWorker;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn(),
      existsById: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      countFailedGeocoding: vi.fn().mockResolvedValue(0),
    } as never;
    geocodingService = { geocode: vi.fn() };
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    worker = new GeocodeWorker(
      propertyRepo as unknown as IPropertyRepository,
      geocodingService as unknown as IGeocodingService,
      auditService,
      logger as never,
    );
  });

  it('geocodes the property and writes SUCCESS with coordinates', async () => {
    propertyRepo.findById.mockResolvedValue(makeProperty());
    geocodingService.geocode.mockResolvedValue({ lat: -26.74, lng: 152.82 });

    await worker.execute({ propertyId: 'prop-1' });

    expect(propertyRepo.update).toHaveBeenCalledWith('prop-1', 'tenant-1', {
      lat: -26.74,
      lng: 152.82,
      geocodingStatus: 'SUCCESS',
    });
  });

  it('writes FAILED when geocoding returns no match', async () => {
    propertyRepo.findById.mockResolvedValue(makeProperty());
    geocodingService.geocode.mockResolvedValue(null);

    await worker.execute({ propertyId: 'prop-1' });

    expect(propertyRepo.update).toHaveBeenCalledWith('prop-1', 'tenant-1', {
      geocodingStatus: 'FAILED',
    });
  });

  it('skips silently (no throw, no geocode) when the property was soft-deleted', async () => {
    propertyRepo.findById.mockResolvedValue(null);
    propertyRepo.existsById.mockResolvedValue(true); // row exists but is soft-deleted

    await expect(worker.execute({ propertyId: 'prop-1' })).resolves.toBeUndefined();

    expect(geocodingService.geocode).not.toHaveBeenCalled();
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });

  it('THROWS when the property is absent entirely (cross-environment consumer / hard-deleted)', async () => {
    propertyRepo.findById.mockResolvedValue(null);
    propertyRepo.existsById.mockResolvedValue(false); // not in this database at all

    // Must fail loudly so pg-boss retries and the job surfaces in the DLQ,
    // instead of silently completing as a no-op and stranding the row in PENDING.
    await expect(worker.execute({ propertyId: 'prop-1' })).rejects.toThrow(/not found/i);
    expect(geocodingService.geocode).not.toHaveBeenCalled();
  });

  it('skips when the property is already SUCCESS', async () => {
    propertyRepo.findById.mockResolvedValue(makeProperty({ geocodingStatus: 'SUCCESS', lat: 1, lng: 2 }));

    await worker.execute({ propertyId: 'prop-1' });

    expect(geocodingService.geocode).not.toHaveBeenCalled();
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });
});
