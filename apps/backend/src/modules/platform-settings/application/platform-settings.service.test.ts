import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformSettingsService } from './platform-settings.service';

const DEFAULTS = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

const repository = { findByKey: vi.fn(), findAll: vi.fn(), upsert: vi.fn() };
const logger = { error: vi.fn() };

let clock = 0;
const now = () => clock;

beforeEach(() => {
  vi.clearAllMocks();
  clock = 0;
});

describe('PlatformSettingsService', () => {
  it('returns the registry defaults with a single repo read when no row exists', async () => {
    repository.findByKey.mockResolvedValue(null);
    const svc = new PlatformSettingsService(repository as never, logger, 30_000, now);

    expect(await svc.get('fieldEvents')).toEqual(DEFAULTS);
    expect(repository.findByKey).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('serves from cache within the TTL and re-reads after it expires', async () => {
    repository.findByKey.mockResolvedValue(null);
    const svc = new PlatformSettingsService(repository as never, logger, 30_000, now);

    await svc.get('fieldEvents');
    clock = 29_999;
    await svc.get('fieldEvents');
    expect(repository.findByKey).toHaveBeenCalledTimes(1);

    clock = 30_001;
    await svc.get('fieldEvents');
    expect(repository.findByKey).toHaveBeenCalledTimes(2);
  });

  it('re-reads the DB after invalidate', async () => {
    repository.findByKey.mockResolvedValue(null);
    const svc = new PlatformSettingsService(repository as never, logger, 30_000, now);

    await svc.get('fieldEvents');
    svc.invalidate('fieldEvents');
    await svc.get('fieldEvents');
    expect(repository.findByKey).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults and logs once per reload when the stored value is invalid', async () => {
    repository.findByKey.mockResolvedValue({ key: 'fieldEvents', valueJson: { geofenceRadiusMeters: 'oops' }, updatedAt: new Date(), updatedBy: null });
    const svc = new PlatformSettingsService(repository as never, logger, 30_000, now);

    expect(await svc.get('fieldEvents')).toEqual(DEFAULTS);
    // Cached within the TTL — a second read does not re-log.
    await svc.get('fieldEvents');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith({ key: 'fieldEvents' }, expect.any(String));

    // After the TTL, it reloads and logs again.
    clock = 30_001;
    await svc.get('fieldEvents');
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('merges a partial stored value over the defaults', async () => {
    repository.findByKey.mockResolvedValue({ key: 'fieldEvents', valueJson: { geofenceMode: 'BLOCK' }, updatedAt: new Date(), updatedBy: null });
    const svc = new PlatformSettingsService(repository as never, logger, 30_000, now);
    expect(await svc.get('fieldEvents')).toEqual({ ...DEFAULTS, geofenceMode: 'BLOCK' });
  });
});
