import { describe, it, expect } from 'vitest';
import {
  redactPii,
  redactByFieldPath,
  type PiiFieldPathSpec,
} from '../../../src/modules/audit/application/helpers/pii-redaction';

describe('redactPii', () => {
  describe('user actions', () => {
    it('redacts email, phone, name in user.created snapshot', () => {
      const snapshot = {
        id: 'user-1',
        email: 'john@example.com',
        phone: '+61400000000',
        name: 'John Doe',
        role: 'CL_ADMIN',
      };

      const result = redactPii('user.created', snapshot) as Record<string, unknown>;

      expect(result.email).toBe('[REDACTED]');
      expect(result.phone).toBe('[REDACTED]');
      expect(result.name).toBe('[REDACTED]');
      expect(result.id).toBe('user-1');
      expect(result.role).toBe('CL_ADMIN');
    });
  });

  describe('inspector actions', () => {
    it('redacts PII fields in inspector.updated snapshot', () => {
      const snapshot = {
        id: 'insp-1',
        email: 'inspector@example.com',
        phone: '+61411111111',
        name: 'Jane Smith',
        status: 'ACTIVE',
      };

      const result = redactPii('inspector.updated', snapshot) as Record<string, unknown>;

      expect(result.email).toBe('[REDACTED]');
      expect(result.phone).toBe('[REDACTED]');
      expect(result.name).toBe('[REDACTED]');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('tenant portal actions', () => {
    it('redacts primaryEmail and primaryPhone in portal actions', () => {
      const snapshot = {
        appointmentId: 'apt-1',
        primaryEmail: 'tenant@example.com',
        primaryPhone: '+61422222222',
        name: 'Tenant Name',
        confirmationStatus: 'CONFIRMED',
      };

      const result = redactPii('portal.confirm', snapshot) as Record<string, unknown>;

      expect(result.primaryEmail).toBe('[REDACTED]');
      expect(result.primaryPhone).toBe('[REDACTED]');
      expect(result.name).toBe('[REDACTED]');
      expect(result.appointmentId).toBe('apt-1');
      expect(result.confirmationStatus).toBe('CONFIRMED');
    });
  });

  describe('appointment contact actions', () => {
    it('redacts nested contact PII fields', () => {
      const snapshot = {
        id: 'apt-1',
        contact: {
          tenantName: 'John Doe',
          primaryEmail: 'john@example.com',
          primaryPhone: '+61400000000',
        },
        status: 'DRAFT',
      };

      const result = redactPii('appointment.updated', snapshot) as Record<string, unknown>;

      const contact = result.contact as Record<string, unknown>;
      expect(contact.tenantName).toBe('[REDACTED]');
      expect(contact.primaryEmail).toBe('[REDACTED]');
      expect(contact.primaryPhone).toBe('[REDACTED]');
      expect(result.status).toBe('DRAFT');
    });

    it('redacts flat tenant fields in appointment actions', () => {
      const snapshot = {
        tenantName: 'Doe Tenant',
        tenantEmail: 'doe@example.com',
        tenantPhone: '+61400000000',
        appointmentId: 'apt-1',
      };

      const result = redactPii('appointment.created', snapshot) as Record<string, unknown>;

      expect(result.tenantName).toBe('[REDACTED]');
      expect(result.tenantEmail).toBe('[REDACTED]');
      expect(result.tenantPhone).toBe('[REDACTED]');
      expect(result.appointmentId).toBe('apt-1');
    });
  });

  describe('non-PII preservation', () => {
    it('preserves all fields for unknown action prefixes', () => {
      const snapshot = {
        email: 'john@example.com',
        name: 'John Doe',
        phone: '+61400000000',
        status: 'ACTIVE',
      };

      const result = redactPii('unknownAction.something', snapshot) as Record<string, unknown>;

      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John Doe');
      expect(result.phone).toBe('+61400000000');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('null and edge cases', () => {
    it('returns null snapshot as-is', () => {
      expect(redactPii('user.created', null)).toBeNull();
    });

    it('returns undefined snapshot as-is', () => {
      expect(redactPii('user.created', undefined)).toBeUndefined();
    });

    it('returns non-object snapshots as-is', () => {
      expect(redactPii('user.created', 'string-value')).toBe('string-value');
    });

    it('does not mutate original snapshot', () => {
      const original = {
        email: 'john@example.com',
        name: 'John Doe',
      };
      const originalCopy = JSON.parse(JSON.stringify(original));

      redactPii('user.created', original);

      expect(original).toEqual(originalCopy);
    });

    it('handles missing nested paths gracefully', () => {
      const snapshot = {
        id: 'apt-1',
        status: 'DRAFT',
        // No contact object
      };

      const result = redactPii('appointment.updated', snapshot) as Record<string, unknown>;

      expect(result.id).toBe('apt-1');
      expect(result.status).toBe('DRAFT');
    });

    it('does not redact null-valued PII fields', () => {
      const snapshot = {
        id: 'user-1',
        email: null,
        name: null,
        phone: undefined,
      };

      const result = redactPii('user.created', snapshot) as Record<string, unknown>;

      // null becomes null in JSON.parse/stringify
      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
    });
  });

  describe('auth actions', () => {
    it('redacts PII in auth.loginSuccess', () => {
      const snapshot = {
        email: 'admin@example.com',
        name: 'Admin',
        ipAddress: '1.2.3.4',
      };

      const result = redactPii('auth.loginSuccess', snapshot) as Record<string, unknown>;

      expect(result.email).toBe('[REDACTED]');
      expect(result.name).toBe('[REDACTED]');
      expect(result.ipAddress).toBe('1.2.3.4');
    });
  });
});

describe('redactByFieldPath (Feature 020 on-demand redaction)', () => {
  it('replaces a single dotted path with [REDACTED] (direct)', () => {
    const snapshot = { user: { email: 'foo@bar.com', name: 'Alice' } };
    const paths: PiiFieldPathSpec[] = [{ path: 'user.email', classification: 'direct' }];

    const { redacted, flaggedForReview } = redactByFieldPath(snapshot, paths);

    expect((redacted as any).user.email).toBe('[REDACTED]');
    expect((redacted as any).user.name).toBe('Alice');
    expect(flaggedForReview).toEqual([]);
  });

  it('redacts multiple dotted paths in one call', () => {
    const snapshot = { user: { email: 'foo@bar.com', phone: '+1234' }, meta: { note: 'n' } };
    const paths: PiiFieldPathSpec[] = [
      { path: 'user.email', classification: 'direct' },
      { path: 'user.phone', classification: 'direct' },
    ];

    const { redacted } = redactByFieldPath(snapshot, paths);

    expect((redacted as any).user.email).toBe('[REDACTED]');
    expect((redacted as any).user.phone).toBe('[REDACTED]');
    expect((redacted as any).meta.note).toBe('n');
  });

  it('silently skips non-matching paths', () => {
    const snapshot = { user: { email: 'foo@bar.com' } };
    const paths: PiiFieldPathSpec[] = [
      { path: 'user.email', classification: 'direct' },
      { path: 'user.ghost', classification: 'direct' },
      { path: 'absent.path', classification: 'direct' },
    ];

    const { redacted } = redactByFieldPath(snapshot, paths);

    expect((redacted as any).user.email).toBe('[REDACTED]');
    expect((redacted as any).user).not.toHaveProperty('ghost');
    expect(redacted).not.toHaveProperty('absent');
  });

  it('opaque replacement for sensitive_financial (entire field replaced)', () => {
    const snapshot = { paymentSettingsJson: { bank: 'X', iban: 'Y', internal: { secret: 1 } } };
    const paths: PiiFieldPathSpec[] = [
      { path: 'paymentSettingsJson', classification: 'sensitive_financial' },
    ];

    const { redacted } = redactByFieldPath(snapshot, paths);

    expect((redacted as any).paymentSettingsJson).toBe('[REDACTED]');
  });

  it('flags unstructured paths for manual review without mutating', () => {
    const snapshot = { customFieldsJson: { note: 'may contain pii' }, email: 'a@b.c' };
    const paths: PiiFieldPathSpec[] = [
      { path: 'customFieldsJson', classification: 'unstructured' },
      { path: 'email', classification: 'direct' },
    ];

    const { redacted, flaggedForReview } = redactByFieldPath(snapshot, paths);

    expect((redacted as any).customFieldsJson).toEqual({ note: 'may contain pii' });
    expect((redacted as any).email).toBe('[REDACTED]');
    expect(flaggedForReview).toEqual(['customFieldsJson']);
  });

  it('is irreversible per call — deep-clones the snapshot', () => {
    const snapshot = { user: { email: 'foo@bar.com' } };
    const paths: PiiFieldPathSpec[] = [{ path: 'user.email', classification: 'direct' }];

    const { redacted } = redactByFieldPath(snapshot, paths);

    expect(snapshot.user.email).toBe('foo@bar.com'); // original untouched
    expect((redacted as any).user.email).toBe('[REDACTED]');
    expect(redacted).not.toBe(snapshot);
  });

  it('passes through null / undefined / non-object snapshots', () => {
    expect(redactByFieldPath(null, []).redacted).toBeNull();
    expect(redactByFieldPath(undefined, []).redacted).toBeUndefined();
    expect(redactByFieldPath('string-value', []).redacted).toBe('string-value');
    expect(redactByFieldPath([1, 2, 3], []).redacted).toEqual([1, 2, 3]);
  });
});
