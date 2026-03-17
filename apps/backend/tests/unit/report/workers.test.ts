import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWork } = vi.hoisted(() => ({
  mockWork: vi.fn(),
}));

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({ work: mockWork }),
}));

import { registerWorkers } from '../../../src/main/workers';

describe('registerWorkers', () => {
  const mockExecute = vi.fn();
  const mockProcessReportJobUseCase = { execute: mockExecute } as any;
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers report.generate worker with pg-boss', async () => {
    await registerWorkers(mockProcessReportJobUseCase, mockLogger);

    expect(mockWork).toHaveBeenCalledOnce();
    expect(mockWork).toHaveBeenCalledWith('report.generate', expect.any(Function));
    expect(mockLogger.info).toHaveBeenCalledWith('pg-boss workers registered: report.generate');
  });

  it('worker handler calls processReportJobUseCase.execute with correct reportId', async () => {
    await registerWorkers(mockProcessReportJobUseCase, mockLogger);

    // Extract the handler function that was registered
    const handler = mockWork.mock.calls[0][1];
    const fakeJob = { id: 'job-456', data: { reportId: 'report-123' } };

    await handler(fakeJob);

    expect(mockExecute).toHaveBeenCalledOnce();
    expect(mockExecute).toHaveBeenCalledWith('report-123');
    expect(mockLogger.info).toHaveBeenCalledWith(
      { reportId: 'report-123', jobId: 'job-456' },
      'Processing report.generate job',
    );
  });

  it('propagates errors from use case for pg-boss retry handling', async () => {
    const error = new Error('Report generation failed');
    mockExecute.mockRejectedValueOnce(error);

    await registerWorkers(mockProcessReportJobUseCase, mockLogger);

    const handler = mockWork.mock.calls[0][1];
    const fakeJob = { id: 'job-789', data: { reportId: 'report-fail' } };

    await expect(handler(fakeJob)).rejects.toThrow('Report generation failed');
  });
});
