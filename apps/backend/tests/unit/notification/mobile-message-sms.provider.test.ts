import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MobileMessageSmsProvider } from '../../../src/modules/notification/infrastructure/mobile-message-sms.provider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okBody = {
  status: 'complete',
  results: [{ status: 'success', message_id: 'mm-real-id', cost: 1, encoding: 'gsm7' }],
};

describe('MobileMessageSmsProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: MobileMessageSmsProvider;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody));
    vi.stubGlobal('fetch', fetchMock);
    provider = new MobileMessageSmsProvider('user', 'pass', 'PROPERFY', 'https://api.example.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('send', () => {
    it('POSTs to /v1/messages with Basic auth and the documented payload shape', async () => {
      await provider.send('+61412345678', 'hello', {
        idempotencyKey: 'notif-1-1',
        customRef: 'notif-1',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.test/v1/messages');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Idempotency-Key']).toBe('notif-1-1');
      expect(JSON.parse(init.body as string)).toEqual({
        messages: [
          { to: '+61412345678', message: 'hello', sender: 'PROPERFY', custom_ref: 'notif-1' },
        ],
      });
    });

    it('passes an abort signal so a hung connection times out', async () => {
      await provider.send('+61412345678', 'hello');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('includes enable_unicode when requested', async () => {
      await provider.send('+61412345678', 'olá ✓', { enableUnicode: true });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).enable_unicode).toBe(true);
    });

    it('returns the provider message_id on success', async () => {
      const result = await provider.send('+61412345678', 'hello');
      expect(result.messageId).toBe('mm-real-id');
    });

    it('throws on a per-message error result instead of reporting success', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          status: 'complete',
          results: [{ status: 'error', error: 'invalid recipient' }],
        }),
      );
      await expect(provider.send('+61412345678', 'hello')).rejects.toThrow(/invalid recipient/);
    });

    it('throws when a 2xx response has no message_id (never fabricates one)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'complete', results: [{ status: 'success' }] }));
      await expect(provider.send('+61412345678', 'hello')).rejects.toThrow(/message_id/);
    });

    it('throws a rate-limit error on HTTP 429', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'too many requests' }, 429));
      await expect(provider.send('+61412345678', 'hello')).rejects.toThrow(/rate limit/i);
    });

    it('throws with status and body on other non-2xx responses', async () => {
      fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));
      await expect(provider.send('+61412345678', 'hello')).rejects.toThrow(/400.*bad request/);
    });
  });

  describe('getStatus', () => {
    it('GETs /v1/messages by message_id and returns the mapped status', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ status: 'complete', results: [{ message_id: 'mm-real-id', status: 'delivered' }] }),
      );
      const status = await provider.getStatus('mm-real-id');
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.test/v1/messages?message_id=mm-real-id');
      expect((init.headers as Record<string, string>)['Authorization']).toContain('Basic ');
      expect(init.method ?? 'GET').toBe('GET');
      expect(status).toBe('delivered');
    });

    it('URL-encodes the message id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
      await provider.getStatus('a b/c');
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('https://api.example.test/v1/messages?message_id=a%20b%2Fc');
    });

    it('returns null when the provider has no record of the message', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'complete', results: [] }));
      expect(await provider.getStatus('unknown')).toBeNull();
    });

    it('returns null on 404', async () => {
      fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
      expect(await provider.getStatus('unknown')).toBeNull();
    });

    it('throws on other non-2xx responses', async () => {
      fetchMock.mockResolvedValue(new Response('server error', { status: 500 }));
      await expect(provider.getStatus('mm-real-id')).rejects.toThrow(/500/);
    });

    it('returns null for unrecognized status values', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ results: [{ message_id: 'x', status: 'weird-new-status' }] }),
      );
      expect(await provider.getStatus('x')).toBeNull();
    });
  });
});
