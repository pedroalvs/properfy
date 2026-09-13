import { describe, it, expect } from 'vitest';
import { formatAuditActor, formatAuditTenant } from './audit-log-display';

describe('formatAuditActor (W2 #408)', () => {
  it('returns the resolved name when present', () => {
    expect(formatAuditActor('USER', 'usr-1', 'Jane Operator')).toBe('Jane Operator');
  });

  it('falls back to the readable actor type alone — never the id or parentheses', () => {
    const out = formatAuditActor('USER', 'usr-1', null);
    expect(out).toBe('User');
    expect(out).not.toContain('usr-1');
    expect(out).not.toContain('(');
  });

  it('formats SYSTEM without an id even when no name is given', () => {
    expect(formatAuditActor('SYSTEM', null, null)).toBe('System');
  });
});

describe('formatAuditTenant (W2 #408)', () => {
  it('returns the resolved tenant name when present', () => {
    expect(formatAuditTenant('ten-1', 'Acme Realty')).toBe('Acme Realty');
  });

  it('labels a null tenant as Global (platform-level)', () => {
    expect(formatAuditTenant(null, null)).toBe('Global');
  });

  it('never returns a raw tenant id when the name is missing', () => {
    const out = formatAuditTenant('ten-1', null);
    expect(out).toBe('Unknown agency');
    expect(out).not.toContain('ten-1');
  });
});
