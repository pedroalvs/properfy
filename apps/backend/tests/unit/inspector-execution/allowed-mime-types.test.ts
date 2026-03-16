import { describe, it, expect } from 'vitest';
import { isAllowedMimeType } from '../../../src/modules/inspector-execution/domain/allowed-mime-types';

describe('isAllowedMimeType', () => {
  describe('PHOTO', () => {
    it('should allow image/jpeg', () => {
      expect(isAllowedMimeType('PHOTO', 'image/jpeg')).toBe(true);
    });

    it('should allow image/png', () => {
      expect(isAllowedMimeType('PHOTO', 'image/png')).toBe(true);
    });

    it('should allow image/heic', () => {
      expect(isAllowedMimeType('PHOTO', 'image/heic')).toBe(true);
    });

    it('should allow image/webp', () => {
      expect(isAllowedMimeType('PHOTO', 'image/webp')).toBe(true);
    });

    it('should NOT allow application/pdf', () => {
      expect(isAllowedMimeType('PHOTO', 'application/pdf')).toBe(false);
    });
  });

  describe('DOCUMENT', () => {
    it('should allow application/pdf', () => {
      expect(isAllowedMimeType('DOCUMENT', 'application/pdf')).toBe(true);
    });

    it('should allow image/jpeg', () => {
      expect(isAllowedMimeType('DOCUMENT', 'image/jpeg')).toBe(true);
    });

    it('should allow image/png', () => {
      expect(isAllowedMimeType('DOCUMENT', 'image/png')).toBe(true);
    });

    it('should NOT allow image/heic', () => {
      expect(isAllowedMimeType('DOCUMENT', 'image/heic')).toBe(false);
    });
  });

  describe('SIGNATURE', () => {
    it('should allow image/png', () => {
      expect(isAllowedMimeType('SIGNATURE', 'image/png')).toBe(true);
    });

    it('should allow image/svg+xml', () => {
      expect(isAllowedMimeType('SIGNATURE', 'image/svg+xml')).toBe(true);
    });

    it('should NOT allow image/jpeg', () => {
      expect(isAllowedMimeType('SIGNATURE', 'image/jpeg')).toBe(false);
    });
  });

  describe('unknown kind', () => {
    it('should return false for unknown kind', () => {
      expect(isAllowedMimeType('VIDEO', 'video/mp4')).toBe(false);
    });
  });
});
