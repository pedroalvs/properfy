import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeInspectorBase } from './geocode-inspector-base';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import { MapboxPermanentGeocodingUnavailableError } from '../../../property/domain/geocoding.service';
import { GeocodeTimeoutError } from '../../../property/application/services/geocode-with-timeout';
import type { InspectorBaseAddress } from '@properfy/shared';

const ADDRESS: InspectorBaseAddress = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

const FIXED = new Date('2026-10-30T00:00:00.000Z');
const clock = { now: () => FIXED };

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeGeocoder(impl: IGeocodingService['geocode']): IGeocodingService {
  return { geocode: vi.fn(impl) };
}

describe('geocodeInspectorBase', () => {
  let logger: ReturnType<typeof makeLogger>;
  beforeEach(() => {
    logger = makeLogger();
  });

  it('calls the geocoder in permanent mode with the formatGeocodingQuery text', async () => {
    const geocoder = makeGeocoder(async () => ({ lat: -33.86, lng: 151.2 }));
    await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(geocoder.geocode).toHaveBeenCalledWith(
      '1 George St, Sydney, NSW, 2000, AU',
      { mode: 'permanent' },
    );
  });

  it('returns coordinates and the clock time on success', async () => {
    const geocoder = makeGeocoder(async () => ({ lat: -33.86, lng: 151.2 }));
    const result = await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(result).toEqual({ lat: -33.86, lng: 151.2, geocodedAt: FIXED });
  });

  it('returns no_results and warns when the geocoder returns null', async () => {
    const geocoder = makeGeocoder(async () => null);
    const result = await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(result).toEqual({ failed: 'no_results' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns error and warns when the geocoder throws, without propagating', async () => {
    const geocoder = makeGeocoder(async () => {
      throw new Error('boom');
    });
    const result = await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(result).toEqual({ failed: 'error' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns timeout when geocodeWithTimeout rejects with GeocodeTimeoutError', async () => {
    const geocoder = makeGeocoder(async () => {
      throw new GeocodeTimeoutError(4000);
    });
    const result = await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(result).toEqual({ failed: 'timeout' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns permanent_unavailable and logs error for a Mapbox permanent-mode rejection', async () => {
    const geocoder = makeGeocoder(async () => {
      throw new MapboxPermanentGeocodingUnavailableError();
    });
    const result = await geocodeInspectorBase(geocoder, ADDRESS, logger as never, clock);
    expect(result).toEqual({ failed: 'permanent_unavailable' });
    expect(logger.error).toHaveBeenCalled();
  });
});
