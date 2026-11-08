import { describe, it, expect } from 'vitest';
import type { InspectorProgramSetting } from '@properfy/shared';
import { prepareInspectorProgramSettingForSave } from './prepare-inspector-program-setting-for-save';

const NOW = new Date('2026-11-08T03:30:00.000Z');

function setting(
  enabled: boolean,
  enabledAt: string | null,
  hours = 12,
): InspectorProgramSetting {
  return {
    levels: { silverMinScore: 60, goldMinScore: 85 },
    earlyAccess: { enabled, hours, minLevel: 'GOLD', enabledAt },
  };
}

describe('prepareInspectorProgramSettingForSave', () => {
  it('stamps now on false→true and ignores the client value', () => {
    const previous = setting(false, null);
    const next = setting(true, '2020-01-01T00:00:00.000Z');
    expect(prepareInspectorProgramSettingForSave(previous, next, NOW).earlyAccess.enabledAt).toBe(
      NOW.toISOString(),
    );
  });

  it('keeps the previous enabledAt on true→true (even when other fields change)', () => {
    const previous = setting(true, '2026-11-01T00:00:00.000Z', 12);
    const next = setting(true, '2026-11-01T00:00:00.000Z', 24);
    const result = prepareInspectorProgramSettingForSave(previous, next, NOW);
    expect(result.earlyAccess.enabledAt).toBe('2026-11-01T00:00:00.000Z');
    expect(result.earlyAccess.hours).toBe(24);
  });

  it('clears enabledAt on true→false', () => {
    const previous = setting(true, '2026-11-01T00:00:00.000Z');
    const next = setting(false, '2026-11-01T00:00:00.000Z');
    expect(prepareInspectorProgramSettingForSave(previous, next, NOW).earlyAccess.enabledAt).toBeNull();
  });

  it('keeps enabledAt null on false→false', () => {
    const previous = setting(false, null);
    const next = setting(false, null);
    expect(prepareInspectorProgramSettingForSave(previous, next, NOW).earlyAccess.enabledAt).toBeNull();
  });

  it('stamps now when there is no prior record (defaults) and it is switched on', () => {
    // No prior row → the use case passes the resolved defaults (enabled:false).
    const previous = setting(false, null);
    const next = setting(true, null);
    expect(prepareInspectorProgramSettingForSave(previous, next, NOW).earlyAccess.enabledAt).toBe(
      NOW.toISOString(),
    );
  });
});
