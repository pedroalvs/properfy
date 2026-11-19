import { describe, expect, it } from 'vitest';
import { resolveParticipants, type ParticipantInspector } from './participants';

const insp = (id: string, over: Partial<ParticipantInspector> = {}): ParticipantInspector => ({
  id,
  status: 'ACTIVE',
  deletedAt: null,
  serviceTypeIds: [],
  ...over,
});

const everyone = [
  insp('a'),
  insp('b'),
  insp('c', { status: 'INACTIVE' }),
  insp('d', { deletedAt: new Date() }),
];

describe('resolveParticipants', () => {
  it('VOLUME without scope: all active, non-deleted', () => {
    const goal = { metric: 'VOLUME' as const, scopeServiceTypeId: null, scopeInspectorId: null };
    expect(resolveParticipants(goal, everyone, new Set())).toEqual(['a', 'b']);
  });

  it('REGION_VOLUME: only inspectors linked to the region', () => {
    const goal = { metric: 'REGION_VOLUME' as const, scopeServiceTypeId: null, scopeInspectorId: null };
    expect(resolveParticipants(goal, everyone, new Set(['a']))).toEqual(['a']);
  });

  it('SERVICE_TYPE_VOLUME: only inspectors who carry the type', () => {
    const goal = { metric: 'SERVICE_TYPE_VOLUME' as const, scopeServiceTypeId: 'st-1', scopeInspectorId: null };
    const pool = [insp('a', { serviceTypeIds: ['st-1'] }), insp('b', { serviceTypeIds: ['st-2'] })];
    expect(resolveParticipants(goal, pool, new Set())).toEqual(['a']);
  });

  it('scope_inspector_id: only that inspector when active', () => {
    const goal = { metric: 'VOLUME' as const, scopeServiceTypeId: null, scopeInspectorId: 'b' };
    expect(resolveParticipants(goal, everyone, new Set())).toEqual(['b']);
  });

  it('scope_inspector_id outside a REGION_VOLUME region → empty', () => {
    const goal = { metric: 'REGION_VOLUME' as const, scopeServiceTypeId: null, scopeInspectorId: 'b' };
    expect(resolveParticipants(goal, everyone, new Set(['a']))).toEqual([]);
  });
});
