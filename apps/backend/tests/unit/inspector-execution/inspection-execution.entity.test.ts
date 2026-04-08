import { describe, it, expect } from 'vitest';
import {
  InspectionExecutionEntity,
  type InspectionExecutionProps,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';

function makeExecution(overrides: Partial<InspectionExecutionProps> = {}): InspectionExecutionEntity {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-16T09:00:00Z'),
    finishedAt: null,
    resumedAt: null,
    startLatitude: -23.5505,
    startLongitude: -46.6333,
    finishLatitude: null,
    finishLongitude: null,
    geolocationDistanceMeters: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date('2026-03-16T09:00:00Z'),
    updatedAt: new Date('2026-03-16T09:00:00Z'),
    ...overrides,
  });
}

describe('InspectionExecutionEntity', () => {
  it('should set all fields from constructor props', () => {
    const props: InspectionExecutionProps = {
      id: 'exec-1',
      appointmentId: 'appt-1',
      inspectorId: 'insp-1',
      startedAt: new Date('2026-03-16T09:00:00Z'),
      finishedAt: new Date('2026-03-16T10:30:00Z'),
      resumedAt: null,
      startLatitude: -23.5505,
      startLongitude: -46.6333,
      finishLatitude: -23.5510,
      finishLongitude: -46.6340,
      geolocationDistanceMeters: 150,
      checklistJson: { item1: true },
      notes: 'All good',
      createdAt: new Date('2026-03-16T09:00:00Z'),
      updatedAt: new Date('2026-03-16T10:30:00Z'),
    };

    const entity = new InspectionExecutionEntity(props);

    expect(entity.id).toBe('exec-1');
    expect(entity.appointmentId).toBe('appt-1');
    expect(entity.inspectorId).toBe('insp-1');
    expect(entity.startedAt).toEqual(props.startedAt);
    expect(entity.finishedAt).toEqual(props.finishedAt);
    expect(entity.startLatitude).toBe(-23.5505);
    expect(entity.startLongitude).toBe(-46.6333);
    expect(entity.finishLatitude).toBe(-23.5510);
    expect(entity.finishLongitude).toBe(-46.6340);
    expect(entity.checklistJson).toEqual({ item1: true });
    expect(entity.notes).toBe('All good');
    expect(entity.createdAt).toEqual(props.createdAt);
    expect(entity.updatedAt).toEqual(props.updatedAt);
  });

  describe('isFinished()', () => {
    it('should return false when finishedAt is null', () => {
      const entity = makeExecution({ finishedAt: null });
      expect(entity.isFinished()).toBe(false);
    });

    it('should return true when finishedAt is set', () => {
      const entity = makeExecution({ finishedAt: new Date('2026-03-16T10:30:00Z') });
      expect(entity.isFinished()).toBe(true);
    });
  });

  describe('isInProgress()', () => {
    it('should return true when finishedAt is null', () => {
      const entity = makeExecution({ finishedAt: null });
      expect(entity.isInProgress()).toBe(true);
    });

    it('should return false when finishedAt is set', () => {
      const entity = makeExecution({ finishedAt: new Date('2026-03-16T10:30:00Z') });
      expect(entity.isInProgress()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should return IN_PROGRESS when not finished', () => {
      const entity = makeExecution({ finishedAt: null });
      expect(entity.getStatus()).toBe('IN_PROGRESS');
    });

    it('should return FINISHED when finished', () => {
      const entity = makeExecution({ finishedAt: new Date('2026-03-16T10:30:00Z') });
      expect(entity.getStatus()).toBe('FINISHED');
    });
  });
});
