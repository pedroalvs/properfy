import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeocodeWorker } from './geocode.worker';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { IGeocodingService, GeocodingResult } from '../../domain/geocoding.service';
import type { PropertyEntity } from '../../domain/property.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';

function makeProperty(): PropertyEntity {
  return {
    id: 'p1',
    tenantId: 't1',
    geocodingStatus: 'PENDING',
    fullAddress: '1 George St, Sydney, NSW, 2000, AU',
  } as unknown as PropertyEntity;
}

function makeRepo(): IPropertyRepository {
  return {
    findById: vi.fn(async () => makeProperty()),
    existsById: vi.fn(async () => true),
    update: vi.fn(async () => undefined),
    countFailedGeocoding: vi.fn(async () => 0),
  } as unknown as IPropertyRepository;
}

function makeDeps(geocode: IGeocodingService['geocode']) {
  const repo = makeRepo();
  const geocoder: IGeocodingService = { geocode: vi.fn(geocode) };
  const audit = { log: vi.fn() } as unknown as AuditService;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  const worker = new GeocodeWorker(repo, geocoder, audit, logger);
  return { worker, repo, geocoder, audit, logger };
}

const RESULT = (overrides: Partial<GeocodingResult>): GeocodingResult => ({
  lat: -33.86,
  lng: 151.2,
  ...overrides,
});

describe('GeocodeWorker (PR-18 rule A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks SUCCESS with coordinates for a high-relevance address result', async () => {
    const { worker, repo } = makeDeps(async () => RESULT({ placeType: 'address', relevance: 0.95 }));
    await worker.execute({ propertyId: 'p1' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1',
      't1',
      expect.objectContaining({ lat: -33.86, lng: 151.2, geocodingStatus: 'SUCCESS', geocodingFailureCode: null }),
    );
  });

  it('marks FAILED + LOW_RELEVANCE for an address result with relevance < 0.8', async () => {
    const { worker, repo, audit } = makeDeps(async () => RESULT({ placeType: 'address', relevance: 0.5 }));
    await worker.execute({ propertyId: 'p1' });
    expect(repo.update).toHaveBeenCalledWith('p1', 't1', {
      geocodingStatus: 'FAILED',
      geocodingFailureCode: 'LOW_RELEVANCE',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ code: 'LOW_RELEVANCE' }) }),
    );
  });

  it('marks FAILED + COARSE_RESULT for a non-address result (e.g. postcode)', async () => {
    const { worker, repo } = makeDeps(async () => RESULT({ placeType: 'postcode', relevance: 0.99 }));
    await worker.execute({ propertyId: 'p1' });
    expect(repo.update).toHaveBeenCalledWith('p1', 't1', {
      geocodingStatus: 'FAILED',
      geocodingFailureCode: 'COARSE_RESULT',
    });
  });

  it('marks FAILED + COARSE_RESULT for a locality result (part 3 decided — not a success)', async () => {
    const { worker, repo } = makeDeps(async () => RESULT({ placeType: 'locality', relevance: 0.9 }));
    await worker.execute({ propertyId: 'p1' });
    expect(repo.update).toHaveBeenCalledWith('p1', 't1', {
      geocodingStatus: 'FAILED',
      geocodingFailureCode: 'COARSE_RESULT',
    });
  });

  it('marks FAILED (no code) when the geocoder returns null (address not found)', async () => {
    const { worker, repo } = makeDeps(async () => null);
    await worker.execute({ propertyId: 'p1' });
    expect(repo.update).toHaveBeenCalledWith('p1', 't1', { geocodingStatus: 'FAILED' });
  });
});
