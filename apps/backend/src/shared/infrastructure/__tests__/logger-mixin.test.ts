import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { requestContextMixin } from '../logger-mixin';
import { runWithRequestContext } from '../request-context';
import { ExpireTokensWorker } from '../../../modules/rental-tenant-portal/infrastructure/workers/expire-tokens.worker';

describe('requestContextMixin (WI-B7 / #506)', () => {
  it('returns request_id (and tenant_id/user_id) inside a request context', () => {
    const fields = runWithRequestContext(
      { requestId: 'r1', tenantId: 't1', userId: 'u1' },
      () => requestContextMixin(),
    );
    expect(fields).toEqual({ request_id: 'r1', tenant_id: 't1', user_id: 'u1' });
  });

  it('returns only request_id when tenant/user are absent', () => {
    const fields = runWithRequestContext({ requestId: 'r2' }, () => requestContextMixin());
    expect(fields).toEqual({ request_id: 'r2' });
  });

  it('returns {} outside any request context', () => {
    expect(requestContextMixin()).toEqual({});
  });
});

describe('worker logs carry request_id via the mixin (WI-B7 / #506)', () => {
  it('stamps request_id on an ExpireTokensWorker log line running under the ALS context', async () => {
    const lines: string[] = [];
    const stream = { write: (chunk: string) => { lines.push(chunk); } };
    const logger = pino({ mixin: requestContextMixin }, stream);

    const tokenRepo = { expireActiveTokens: vi.fn().mockResolvedValue(2) };
    const worker = new ExpireTokensWorker(tokenRepo as any, logger as any);

    await runWithRequestContext({ requestId: 'job-req-1' }, () => worker.execute());

    const parsed = lines.map((l) => JSON.parse(l));
    const workerLine = parsed.find((l) => l.msg === 'Expired portal tokens');
    expect(workerLine).toBeDefined();
    // This is the assertion that fails if the mixin is ever removed.
    expect(workerLine.request_id).toBe('job-req-1');
    expect(workerLine.expiredCount).toBe(2);
  });
});
