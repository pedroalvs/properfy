import { describe, it, expect } from 'vitest';
import { resolvePgBossSchema, databasesMatch } from '../../../src/shared/infrastructure/queue';

describe('resolvePgBossSchema', () => {
  it('defaults to "pgboss" when PGBOSS_SCHEMA is unset', () => {
    expect(resolvePgBossSchema({})).toBe('pgboss');
  });

  it('returns the configured schema when set', () => {
    expect(resolvePgBossSchema({ PGBOSS_SCHEMA: 'pgboss_staging' })).toBe('pgboss_staging');
  });

  it('derives a per-environment schema from NODE_ENV when PGBOSS_SCHEMA is unset', () => {
    expect(resolvePgBossSchema({ NODE_ENV: 'development' })).toBe('pgboss_dev');
    expect(resolvePgBossSchema({ NODE_ENV: 'staging' })).toBe('pgboss_staging');
    expect(resolvePgBossSchema({ NODE_ENV: 'test' })).toBe('pgboss_test');
    expect(resolvePgBossSchema({ NODE_ENV: 'production' })).toBe('pgboss');
  });

  it('lets an explicit PGBOSS_SCHEMA override the NODE_ENV default', () => {
    expect(resolvePgBossSchema({ PGBOSS_SCHEMA: 'custom_q', NODE_ENV: 'production' })).toBe('custom_q');
  });

  it('rejects schema names with unsafe characters (SQL-injection guard)', () => {
    expect(() => resolvePgBossSchema({ PGBOSS_SCHEMA: 'pgboss; drop table' })).toThrow();
    expect(() => resolvePgBossSchema({ PGBOSS_SCHEMA: 'pg-boss' })).toThrow();
  });
});

describe('databasesMatch', () => {
  it('treats same host + db on different ports (pooled vs direct) as a match', () => {
    expect(
      databasesMatch(
        'postgresql://u:p@db.pooler.supabase.com:6543/postgres',
        'postgresql://u:p@db.pooler.supabase.com:5432/postgres',
      ),
    ).toBe(true);
  });

  it('detects a different host as a mismatch', () => {
    expect(
      databasesMatch(
        'postgresql://u:p@localhost:5432/postgres',
        'postgresql://u:p@db.pooler.supabase.com:5432/postgres',
      ),
    ).toBe(false);
  });

  it('detects a different database name as a mismatch', () => {
    expect(
      databasesMatch(
        'postgresql://u:p@host:5432/dev_db',
        'postgresql://u:p@host:5432/postgres',
      ),
    ).toBe(false);
  });

  it('does not raise a false alarm when a URL is missing or unparseable', () => {
    expect(databasesMatch(undefined, 'postgresql://u:p@host:5432/postgres')).toBe(true);
    expect(databasesMatch('not a url', 'postgresql://u:p@host:5432/postgres')).toBe(true);
  });
});
