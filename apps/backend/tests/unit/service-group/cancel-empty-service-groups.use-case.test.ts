import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelEmptyServiceGroupsUseCase } from '../../../src/modules/service-group/application/use-cases/cancel-empty-service-groups.use-case';

const serviceGroupRepo = { findIdsByStatuses: vi.fn() };
const cancelEmptyGroup = { cancelIfDead: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeUseCase() {
  return new CancelEmptyServiceGroupsUseCase(
    serviceGroupRepo as any,
    cancelEmptyGroup as any,
    logger as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceGroupRepo.findIdsByStatuses.mockResolvedValue([]);
  cancelEmptyGroup.cancelIfDead.mockResolvedValue(false);
});

describe('CancelEmptyServiceGroupsUseCase', () => {
  it('only considers released groups — never DRAFT or terminal ones', async () => {
    await makeUseCase().execute();

    expect(serviceGroupRepo.findIdsByStatuses).toHaveBeenCalledWith(['PUBLISHED', 'ACCEPTED']);
  });

  it('runs every candidate through the cleanup service and counts cancellations', async () => {
    serviceGroupRepo.findIdsByStatuses.mockResolvedValue(['g-1', 'g-2', 'g-3']);
    cancelEmptyGroup.cancelIfDead
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await makeUseCase().execute();

    expect(result).toEqual({ checkedCount: 3, cancelledCount: 2, failedCount: 0 });
    expect(cancelEmptyGroup.cancelIfDead).toHaveBeenCalledTimes(3);
  });

  it('keeps sweeping when one group throws, and counts the failure', async () => {
    serviceGroupRepo.findIdsByStatuses.mockResolvedValue(['g-1', 'g-2', 'g-3']);
    cancelEmptyGroup.cancelIfDead
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(true);

    const result = await makeUseCase().execute();

    expect(result).toEqual({ checkedCount: 3, cancelledCount: 2, failedCount: 1 });
    expect(logger.error).toHaveBeenCalled();
  });

  it('reports zeroes when there is nothing to sweep', async () => {
    const result = await makeUseCase().execute();

    expect(result).toEqual({ checkedCount: 0, cancelledCount: 0, failedCount: 0 });
    expect(cancelEmptyGroup.cancelIfDead).not.toHaveBeenCalled();
  });
});
