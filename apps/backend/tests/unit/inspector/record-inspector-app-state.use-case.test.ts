import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordInspectorAppStateUseCase } from '../../../src/modules/inspector/application/use-cases/record-inspector-app-state.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext, InspectorAppStateInput } from '@properfy/shared';

const FIXED = new Date('2026-10-30T00:00:00.000Z');

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp-1',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: 'inspector-1',
    ...overrides,
  };
}

describe('RecordInspectorAppStateUseCase', () => {
  let inspectorRepo: Pick<IInspectorRepository, 'recordAppState' | 'findById'>;
  let useCase: RecordInspectorAppStateUseCase;

  beforeEach(() => {
    inspectorRepo = {
      recordAppState: vi.fn().mockResolvedValue(1),
      findById: vi.fn(),
    };
    useCase = new RecordInspectorAppStateUseCase(
      inspectorRepo as IInspectorRepository,
      { now: () => FIXED },
    );
  });

  function run(input: InspectorAppStateInput, actor = makeActor()) {
    return useCase.execute({ actor, input });
  }

  it('records a first standalone/granted heartbeat with push enabled', async () => {
    await run({ displayMode: 'standalone', pushPermission: 'granted', appVersion: '0.1.0' });
    expect(inspectorRepo.recordAppState).toHaveBeenCalledTimes(1);
    expect(inspectorRepo.recordAppState).toHaveBeenCalledWith({
      id: 'inspector-1',
      now: FIXED,
      displayMode: 'standalone',
      pushEnabled: true,
      appVersion: '0.1.0',
    });
    // Heartbeat never reads before writing.
    expect(inspectorRepo.findById).not.toHaveBeenCalled();
  });

  it('forwards standalone for a second heartbeat (install COALESCE is the repo/db job)', async () => {
    await run({ displayMode: 'standalone', pushPermission: 'granted', appVersion: '0.2.0' });
    expect(inspectorRepo.recordAppState).toHaveBeenCalledWith(
      expect.objectContaining({ displayMode: 'standalone', appVersion: '0.2.0' }),
    );
  });

  it.each([
    ['browser', 'default'],
    ['browser', 'denied'],
    ['browser', 'unsupported'],
  ] as const)('derives pushEnabled=false for %s/%s', async (displayMode, pushPermission) => {
    await run({ displayMode, pushPermission, appVersion: 'dev' });
    expect(inspectorRepo.recordAppState).toHaveBeenCalledWith(
      expect.objectContaining({ displayMode, pushEnabled: false }),
    );
  });

  it('rejects an OP actor with INSP_ONLY and records nothing', async () => {
    await expect(
      run({ displayMode: 'standalone', pushPermission: 'granted', appVersion: '1' }, makeActor({ role: 'OP', inspectorId: null })),
    ).rejects.toMatchObject({ code: 'INSP_ONLY' });
    await expect(
      run({ displayMode: 'standalone', pushPermission: 'granted', appVersion: '1' }, makeActor({ role: 'OP', inspectorId: null })),
    ).rejects.toThrow(ForbiddenError);
    expect(inspectorRepo.recordAppState).not.toHaveBeenCalled();
  });

  it('maps affected=0 (soft-deleted/missing) to InspectorNotFoundError', async () => {
    vi.mocked(inspectorRepo.recordAppState).mockResolvedValue(0);
    await expect(
      run({ displayMode: 'standalone', pushPermission: 'granted', appVersion: '1' }),
    ).rejects.toThrow(InspectorNotFoundError);
  });
});
