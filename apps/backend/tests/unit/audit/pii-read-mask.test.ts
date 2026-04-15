import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  maskPhone,
  maskName,
} from '../../../src/modules/audit/domain/pii-read-mask';

describe('pii-read-mask (FR-025)', () => {
  describe('maskEmail', () => {
    it('returns raw value for AM', () => {
      expect(maskEmail('user@example.com', 'AM')).toBe('user@example.com');
    });

    it('partial masks for OP — first 3 chars + *** + domain', () => {
      expect(maskEmail('user@example.com', 'OP')).toBe('use***@example.com');
    });

    it('returns [MASKED] for CL_ADMIN', () => {
      expect(maskEmail('user@example.com', 'CL_ADMIN')).toBe('[MASKED]');
    });

    it('passes through null / undefined / empty', () => {
      expect(maskEmail(null, 'OP')).toBeNull();
      expect(maskEmail(undefined, 'OP')).toBeUndefined();
      expect(maskEmail('', 'OP')).toBe('');
    });

    it('handles short local parts gracefully (OP)', () => {
      expect(maskEmail('ab@example.com', 'OP')).toBe('ab***@example.com');
    });
  });

  describe('maskPhone', () => {
    it('returns raw value for AM', () => {
      expect(maskPhone('+5511999998888', 'AM')).toBe('+5511999998888');
    });

    it('returns ***8888 for OP — last 4 digits', () => {
      expect(maskPhone('+5511999998888', 'OP')).toBe('***8888');
    });

    it('extracts digits from formatted phone for OP', () => {
      expect(maskPhone('+55 (11) 99999-8888', 'OP')).toBe('***8888');
    });

    it('returns [MASKED] for CL_ADMIN', () => {
      expect(maskPhone('+5511999998888', 'CL_ADMIN')).toBe('[MASKED]');
    });

    it('passes through null / undefined / empty', () => {
      expect(maskPhone(null, 'OP')).toBeNull();
      expect(maskPhone(undefined, 'OP')).toBeUndefined();
      expect(maskPhone('', 'OP')).toBe('');
    });
  });

  describe('maskName', () => {
    it('returns raw value for AM', () => {
      expect(maskName('John Doe', 'AM')).toBe('John Doe');
    });

    it('returns J. D. for OP', () => {
      expect(maskName('John Doe', 'OP')).toBe('J. D.');
    });

    it('handles single name (OP)', () => {
      expect(maskName('Alice', 'OP')).toBe('A.');
    });

    it('handles multi-name (OP) — uses first and last', () => {
      expect(maskName('Mary Jane Watson', 'OP')).toBe('M. W.');
    });

    it('returns [MASKED] for CL_ADMIN', () => {
      expect(maskName('John Doe', 'CL_ADMIN')).toBe('[MASKED]');
    });

    it('passes through null / undefined / empty', () => {
      expect(maskName(null, 'OP')).toBeNull();
      expect(maskName(undefined, 'OP')).toBeUndefined();
      expect(maskName('', 'OP')).toBe('');
    });
  });
});
