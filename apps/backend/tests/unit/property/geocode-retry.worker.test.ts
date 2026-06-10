import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id'),
}));

vi.mock('../../../src/shared/infrastructure/metrics', () => ({
  metrics: {
    setGeocodingFailedCount: vi.fn(),
  },
}));

import { GeocodeRetryWorker } from '../../../src/modules/property/infrastructure/workers/geocode-retry.worker';
import { sendJob } from '../../../src/shared/infrastructure/queue';
import { metrics } from '../../../src/shared/infrastructure/metrics';

describe('GeocodeRetryWorker', () => {
  const mockPropertyRepo = {
    findFailedGeocoding: vi.fn(),
    findStalePendingGeocoding: vi.fn(),
    countFailedGeocoding: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByIdWithBranch: vi.fn(),
    findByPropertyCode: vi.fn(),
    findAll: vi.fn(),
    findAllWithBranch: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
  };

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as any;

  let worker: GeocodeRetryWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPropertyRepo.findStalePendingGeocoding.mockResolvedValue([]);
    worker = new GeocodeRetryWorker(mockPropertyRepo as any, mockLogger);
  });

  it('returns reenqueuedCount 0 when no FAILED properties exist', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);

    const result = await worker.execute();

    expect(result.reenqueuedCount).toBe(0);
    expect(result.failedGeocodingCount).toBe(0);
    expect(mockPropertyRepo.findFailedGeocoding).toHaveBeenCalledOnce();
    expect(mockPropertyRepo.update).not.toHaveBeenCalled();
    expect(sendJob).not.toHaveBeenCalled();
    expect(metrics.setGeocodingFailedCount).toHaveBeenCalledWith(0);
  });

  it('re-enqueues FAILED properties older than 24h', async () => {
    const failedProperties = [
      { id: 'prop-1', tenantId: 'tenant-1' },
      { id: 'prop-2', tenantId: 'tenant-2' },
    ];
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue(failedProperties);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);
    mockPropertyRepo.update.mockResolvedValue(undefined);

    const result = await worker.execute();

    expect(result.reenqueuedCount).toBe(2);
    expect(mockPropertyRepo.update).toHaveBeenCalledTimes(2);
    expect(mockPropertyRepo.update).toHaveBeenCalledWith('prop-1', 'tenant-1', { geocodingStatus: 'PENDING' });
    expect(mockPropertyRepo.update).toHaveBeenCalledWith('prop-2', 'tenant-2', { geocodingStatus: 'PENDING' });
    expect(sendJob).toHaveBeenCalledTimes(2);
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-2' }, { retryLimit: 6, retryBackoff: true });
  });

  it('passes a cutoff date 24h in the past to findFailedGeocoding', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);

    const before = Date.now();
    await worker.execute();
    const after = Date.now();

    const cutoffArg = mockPropertyRepo.findFailedGeocoding.mock.calls[0][0] as Date;
    const expectedMin = before - 24 * 60 * 60 * 1000;
    const expectedMax = after - 24 * 60 * 60 * 1000;

    expect(cutoffArg.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffArg.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('updates the geocoding failed gauge metric', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(5);

    const result = await worker.execute();

    expect(result.failedGeocodingCount).toBe(5);
    expect(metrics.setGeocodingFailedCount).toHaveBeenCalledWith(5);
  });

  it('continues processing when a single property fails to re-enqueue', async () => {
    const failedProperties = [
      { id: 'prop-1', tenantId: 'tenant-1' },
      { id: 'prop-2', tenantId: 'tenant-2' },
      { id: 'prop-3', tenantId: 'tenant-3' },
    ];
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue(failedProperties);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(1);
    mockPropertyRepo.update.mockResolvedValueOnce(undefined);
    mockPropertyRepo.update.mockRejectedValueOnce(new Error('DB error'));
    mockPropertyRepo.update.mockResolvedValueOnce(undefined);

    const result = await worker.execute();

    expect(result.reenqueuedCount).toBe(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { propertyId: 'prop-2', error: expect.any(Error) },
      'Failed to re-enqueue geocoding job',
    );
  });

  it('re-enqueues stale PENDING properties whose enqueue was lost (no coordinates)', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.findStalePendingGeocoding.mockResolvedValue([
      { id: 'pend-1', tenantId: 'tenant-1' },
      { id: 'pend-2', tenantId: 'tenant-2' },
    ]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);

    const result = await worker.execute();

    expect(result.pendingReenqueuedCount).toBe(2);
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'pend-1' }, { retryLimit: 6, retryBackoff: true });
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'pend-2' }, { retryLimit: 6, retryBackoff: true });
    // Stale PENDING are already PENDING — no status flip needed
    expect(mockPropertyRepo.update).not.toHaveBeenCalled();
  });

  it('passes a cutoff a few minutes in the past to findStalePendingGeocoding', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.findStalePendingGeocoding.mockResolvedValue([]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);

    const before = Date.now();
    await worker.execute();
    const after = Date.now();

    const cutoffArg = mockPropertyRepo.findStalePendingGeocoding.mock.calls[0][0] as Date;
    const tenMin = 10 * 60 * 1000;
    expect(cutoffArg.getTime()).toBeGreaterThanOrEqual(before - tenMin);
    expect(cutoffArg.getTime()).toBeLessThanOrEqual(after - tenMin);
  });

  it('continues processing when a single stale PENDING property fails to re-enqueue', async () => {
    mockPropertyRepo.findFailedGeocoding.mockResolvedValue([]);
    mockPropertyRepo.findStalePendingGeocoding.mockResolvedValue([
      { id: 'pend-1', tenantId: 'tenant-1' },
      { id: 'pend-2', tenantId: 'tenant-2' },
    ]);
    mockPropertyRepo.countFailedGeocoding.mockResolvedValue(0);
    vi.mocked(sendJob).mockResolvedValueOnce('job-id').mockRejectedValueOnce(new Error('queue down'));

    const result = await worker.execute();

    expect(result.pendingReenqueuedCount).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { propertyId: 'pend-2', error: expect.any(Error) },
      'Failed to re-enqueue stale pending geocoding job',
    );
  });
});
