import { describe, it, expect } from 'vitest';
import type { ErasureRequestStatus } from '@properfy/shared';
import { DataSubjectErasureRequestEntity } from '../../../src/modules/audit/domain/data-subject-erasure-request.entity';
import { ErasureRequestInvalidStateError } from '../../../src/modules/audit/domain/audit.errors';

function makeRequest(status: ErasureRequestStatus): DataSubjectErasureRequestEntity {
  return new DataSubjectErasureRequestEntity({
    id: 'req-1',
    subjectIdentifierType: 'email',
    subjectIdentifierValue: 'foo@bar.com',
    resolvedPiiValuesJson: null,
    status,
    entriesFoundCount: null,
    entriesRedactedCount: null,
    entriesFlaggedForReviewCount: null,
    completionReportJson: null,
    initiatedByUserId: 'am-1',
    initiatedAt: new Date(),
    completedAt: null,
  });
}

describe('DataSubjectErasureRequestEntity — transition state machine (B1 #411)', () => {
  describe('valid transitions succeed', () => {
    it('PENDING → SCANNING via markScanning', () => {
      const r = makeRequest('PENDING');
      r.markScanning();
      expect(r.status).toBe('SCANNING');
    });

    it('SCANNING → PREVIEW via markPreview', () => {
      const r = makeRequest('SCANNING');
      r.markPreview(3, 1, ['foo@bar.com']);
      expect(r.status).toBe('PREVIEW');
      expect(r.entriesFoundCount).toBe(3);
      expect(r.entriesFlaggedForReviewCount).toBe(1);
      expect(r.resolvedPiiValuesJson).toEqual(['foo@bar.com']);
    });

    it('PREVIEW → CONFIRMED via markConfirmed', () => {
      const r = makeRequest('PREVIEW');
      r.markConfirmed();
      expect(r.status).toBe('CONFIRMED');
    });

    it('CONFIRMED → EXECUTING via markExecuting', () => {
      const r = makeRequest('CONFIRMED');
      r.markExecuting();
      expect(r.status).toBe('EXECUTING');
    });

    it('PREVIEW → EXECUTING via markExecuting (execute may skip explicit confirm)', () => {
      const r = makeRequest('PREVIEW');
      r.markExecuting();
      expect(r.status).toBe('EXECUTING');
    });

    it('EXECUTING → COMPLETED via markCompleted', () => {
      const r = makeRequest('EXECUTING');
      r.markCompleted(5, { entriesRedacted: 5 });
      expect(r.status).toBe('COMPLETED');
      expect(r.entriesRedactedCount).toBe(5);
      expect(r.completedAt).toBeInstanceOf(Date);
    });

    it('markFailed is reachable from every non-terminal state', () => {
      const nonTerminal: ErasureRequestStatus[] = [
        'PENDING',
        'SCANNING',
        'PREVIEW',
        'CONFIRMED',
        'EXECUTING',
      ];
      for (const status of nonTerminal) {
        const r = makeRequest(status);
        r.markFailed('boom');
        expect(r.status).toBe('FAILED');
      }
    });
  });

  describe('invalid transitions throw ErasureRequestInvalidStateError', () => {
    it('PENDING → EXECUTING is rejected', () => {
      const r = makeRequest('PENDING');
      expect(() => r.markExecuting()).toThrow(ErasureRequestInvalidStateError);
    });

    it('COMPLETED → SCANNING is rejected (terminal)', () => {
      const r = makeRequest('COMPLETED');
      expect(() => r.markScanning()).toThrow(ErasureRequestInvalidStateError);
    });

    it('COMPLETED → FAILED is rejected (terminal cannot fail)', () => {
      const r = makeRequest('COMPLETED');
      expect(() => r.markFailed('boom')).toThrow(ErasureRequestInvalidStateError);
    });

    it('FAILED → COMPLETED is rejected (terminal)', () => {
      const r = makeRequest('FAILED');
      expect(() => r.markCompleted(0, {})).toThrow(ErasureRequestInvalidStateError);
    });

    it('SCANNING → CONFIRMED is rejected (must go through PREVIEW)', () => {
      const r = makeRequest('SCANNING');
      expect(() => r.markConfirmed()).toThrow(ErasureRequestInvalidStateError);
    });

    it('PENDING → COMPLETED is rejected', () => {
      const r = makeRequest('PENDING');
      expect(() => r.markCompleted(0, {})).toThrow(ErasureRequestInvalidStateError);
    });
  });
});
