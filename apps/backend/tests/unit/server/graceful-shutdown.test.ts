import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  stopQueue: vi.fn().mockResolvedValue(undefined),
}));

import { createShutdownHandler } from '../../../src/main/server';
import { stopQueue } from '../../../src/shared/infrastructure/queue';

const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('createShutdownHandler', () => {
  const mockApp = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls app.close() on shutdown', async () => {
    const handler = createShutdownHandler(mockApp, mockLogger, false);
    await handler('SIGTERM');

    expect(mockApp.close).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { signal: 'SIGTERM' },
      'Shutdown signal received, draining...',
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('calls stopQueue() after app.close() when queue is enabled', async () => {
    const handler = createShutdownHandler(mockApp, mockLogger, true);
    await handler('SIGINT');

    expect(mockApp.close).toHaveBeenCalledOnce();
    expect(stopQueue).toHaveBeenCalledOnce();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('does NOT call stopQueue() when queue is disabled', async () => {
    const handler = createShutdownHandler(mockApp, mockLogger, false);
    await handler('SIGTERM');

    expect(mockApp.close).toHaveBeenCalledOnce();
    expect(stopQueue).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('still exits if app.close() throws', async () => {
    mockApp.close.mockRejectedValueOnce(new Error('close failed'));
    const handler = createShutdownHandler(mockApp, mockLogger, false);
    await handler('SIGTERM');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      'Error during shutdown',
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
