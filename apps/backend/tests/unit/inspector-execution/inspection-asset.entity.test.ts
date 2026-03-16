import { describe, it, expect } from 'vitest';
import {
  InspectionAssetEntity,
  type InspectionAssetProps,
} from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';

function makeAsset(overrides: Partial<InspectionAssetProps> = {}): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id: 'asset-1',
    appointmentId: 'appt-1',
    inspectionExecutionId: 'exec-1',
    storageKey: 'inspections/appt-1/photo-001.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: null,
    kind: 'PHOTO',
    status: 'PENDING',
    uploadedBy: 'insp-1',
    uploadExpiresAt: new Date('2026-03-16T10:00:00Z'),
    createdAt: new Date('2026-03-16T09:00:00Z'),
    ...overrides,
  });
}

describe('InspectionAssetEntity', () => {
  describe('isUploaded()', () => {
    it('should return true when status is UPLOADED', () => {
      const asset = makeAsset({ status: 'UPLOADED' });
      expect(asset.isUploaded()).toBe(true);
    });

    it('should return false when status is PENDING', () => {
      const asset = makeAsset({ status: 'PENDING' });
      expect(asset.isUploaded()).toBe(false);
    });

    it('should return false when status is UPLOAD_FAILED', () => {
      const asset = makeAsset({ status: 'UPLOAD_FAILED' });
      expect(asset.isUploaded()).toBe(false);
    });
  });

  describe('isPending()', () => {
    it('should return true when status is PENDING', () => {
      const asset = makeAsset({ status: 'PENDING' });
      expect(asset.isPending()).toBe(true);
    });

    it('should return false when status is UPLOADED', () => {
      const asset = makeAsset({ status: 'UPLOADED' });
      expect(asset.isPending()).toBe(false);
    });
  });

  describe('isExpired()', () => {
    it('should return false when uploadExpiresAt is null', () => {
      const asset = makeAsset({ uploadExpiresAt: null });
      expect(asset.isExpired(new Date())).toBe(false);
    });

    it('should return true when now is after uploadExpiresAt', () => {
      const asset = makeAsset({ uploadExpiresAt: new Date('2026-03-16T10:00:00Z') });
      const now = new Date('2026-03-16T10:01:00Z');
      expect(asset.isExpired(now)).toBe(true);
    });

    it('should return false when now is before uploadExpiresAt', () => {
      const asset = makeAsset({ uploadExpiresAt: new Date('2026-03-16T10:00:00Z') });
      const now = new Date('2026-03-16T09:30:00Z');
      expect(asset.isExpired(now)).toBe(false);
    });
  });

  describe('markUploaded()', () => {
    it('should set status to UPLOADED and sizeBytes', () => {
      const asset = makeAsset({ status: 'PENDING', sizeBytes: null });
      asset.markUploaded(1024);
      expect(asset.status).toBe('UPLOADED');
      expect(asset.sizeBytes).toBe(1024);
    });
  });

  describe('markFailed()', () => {
    it('should set status to UPLOAD_FAILED', () => {
      const asset = makeAsset({ status: 'PENDING' });
      asset.markFailed();
      expect(asset.status).toBe('UPLOAD_FAILED');
    });
  });
});
