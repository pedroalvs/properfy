import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import { generateKeyPairSync } from 'crypto';
import { SignJWT, importPKCS8 } from 'jose';

// Generate test key pair
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

describe('JwtService', () => {
  let jwtService: JwtService;

  beforeAll(() => {
    jwtService = new JwtService({
      privateKeyPem,
      publicKeyPem,
      keyId: 'test-key-v1',
    });
  });

  it('should sign and verify an access token', async () => {
    const token = await jwtService.signAccessToken({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'CL_ADMIN',
      branch_id: null,
      inspector_id: null,
    });
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
    const ctx = await jwtService.verify(token);
    expect(ctx.userId).toBe('user-1');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.role).toBe('CL_ADMIN');
    expect(ctx.branchId).toBeNull();
  });

  it('round-trips auth_stage=totp_setup into authStage on the AuthContext', async () => {
    const token = await jwtService.signAccessToken({
      sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null,
      auth_stage: 'totp_setup',
    });
    const ctx = await jwtService.verify(token);
    expect(ctx.authStage).toBe('totp_setup');
  });

  it('leaves authStage undefined on a normal token', async () => {
    const token = await jwtService.signAccessToken({
      sub: 'user-1', tenant_id: null, role: 'CL_ADMIN', branch_id: null, inspector_id: null,
    });
    const ctx = await jwtService.verify(token);
    expect(ctx.authStage).toBeUndefined();
  });

  it('should reject a tampered token', async () => {
    const token = await jwtService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null });
    const parts = token.split('.');
    const tamperedToken = parts[0] + '.' + parts[1] + 'X' + '.' + parts[2];
    await expect(jwtService.verify(tamperedToken)).rejects.toThrow();
  });

  it('should reject a token signed with wrong key', async () => {
    const { privateKey: otherPrivKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPrivKeyPem = otherPrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const otherService = new JwtService({ privateKeyPem: otherPrivKeyPem, publicKeyPem, keyId: 'test-key-v1' });
    // otherService signs with different private key but uses same public key — should fail
    // Actually let's create a completely separate pair
    const { privateKey: p2, publicKey: pub2 } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem2 = p2.export({ type: 'pkcs8', format: 'pem' }) as string;
    const pub2Pem = pub2.export({ type: 'spki', format: 'pem' }) as string;
    const wrongKeyService = new JwtService({ privateKeyPem: pem2, publicKeyPem: pub2Pem, keyId: 'test-key-v1' });
    const tokenFromWrongKey = await wrongKeyService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null });
    await expect(jwtService.verify(tokenFromWrongKey)).rejects.toThrow();
  });

  it('should handle null tenantId and branchId', async () => {
    const token = await jwtService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null });
    const ctx = await jwtService.verify(token);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.branchId).toBeNull();
  });

  it('should include inspector_id in token payload and return it on verify', async () => {
    const token = await jwtService.signAccessToken({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'INSP',
      branch_id: null,
      inspector_id: 'insp-1',
    });
    const ctx = await jwtService.verify(token);
    expect(ctx.inspectorId).toBe('insp-1');
  });

  it('should return null inspectorId when inspector_id claim is null', async () => {
    const token = await jwtService.signAccessToken({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'CL_ADMIN',
      branch_id: null,
      inspector_id: null,
    });
    const ctx = await jwtService.verify(token);
    expect(ctx.inspectorId).toBeNull();
  });

  describe('getPreviousKeyDaysRemaining', () => {
    it('should return null when no previous key is configured', () => {
      const service = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
      });
      expect(service.getPreviousKeyDaysRemaining()).toBeNull();
    });

    it('should return correct days when previous key expires in 30 days', () => {
      const service = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
        previousPublicKeyPem: publicKeyPem,
        previousKeyId: 'prev-key',
        previousKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      expect(service.getPreviousKeyDaysRemaining()).toBe(30);
    });

    it('should return 0 when previous key has already expired', () => {
      const service = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
        previousPublicKeyPem: publicKeyPem,
        previousKeyId: 'prev-key',
        previousKeyExpiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      expect(service.getPreviousKeyDaysRemaining()).toBe(0);
    });

    it('should return 1 when previous key expires in less than 24 hours', () => {
      const service = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
        previousPublicKeyPem: publicKeyPem,
        previousKeyId: 'prev-key',
        previousKeyExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      });
      expect(service.getPreviousKeyDaysRemaining()).toBe(1);
    });

    it('defaults to a ~30-day deadline frozen at construction when previousKeyExpiresAt is not set (#254)', () => {
      const service = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
        previousPublicKeyPem: publicKeyPem,
        previousKeyId: 'prev-key',
        // no previousKeyExpiresAt — the constructor freezes one automatically.
      });
      expect(service.getPreviousKeyDaysRemaining()).toBe(30);
    });
  });

  describe('key rotation with expiration', () => {
    it('should verify token signed with previous key when not expired', async () => {
      const { privateKey: prevPriv, publicKey: prevPub } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const prevPrivPem = prevPriv.export({ type: 'pkcs8', format: 'pem' }) as string;
      const prevPubPem = prevPub.export({ type: 'spki', format: 'pem' }) as string;

      // Sign token with previous key
      const prevService = new JwtService({ privateKeyPem: prevPrivPem, publicKeyPem: prevPubPem, keyId: 'prev-key-v1' });
      const token = await prevService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null });

      // Create new service that knows about previous key (not expired)
      const rotatedService = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v2',
        previousPublicKeyPem: prevPubPem,
        previousKeyId: 'prev-key-v1',
        previousKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      });
      const ctx = await rotatedService.verify(token);
      expect(ctx.userId).toBe('user-1');
    });

    it('should reject token signed with previous key when expired', async () => {
      const { privateKey: prevPriv, publicKey: prevPub } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const prevPrivPem = prevPriv.export({ type: 'pkcs8', format: 'pem' }) as string;
      const prevPubPem = prevPub.export({ type: 'spki', format: 'pem' }) as string;

      // Sign token with previous key
      const prevService = new JwtService({ privateKeyPem: prevPrivPem, publicKeyPem: prevPubPem, keyId: 'prev-key-v1' });
      const token = await prevService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null });

      // Create new service with expired previous key
      const rotatedService = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v2',
        previousPublicKeyPem: prevPubPem,
        previousKeyId: 'prev-key-v1',
        previousKeyExpiresAt: new Date(Date.now() - 1000), // already expired
      });
      await expect(rotatedService.verify(token)).rejects.toThrow();
    });
  });

  describe('#254 — previous-key grace deadline is frozen at construction', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects a token signed with the previous key once 31 days have passed since construction, even though verify() is called repeatedly in between', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-01-01T00:00:00.000Z');
      vi.setSystemTime(now);

      const { privateKey: prevPriv, publicKey: prevPub } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const prevPrivPem = prevPriv.export({ type: 'pkcs8', format: 'pem' }) as string;
      const prevPubPem = prevPub.export({ type: 'spki', format: 'pem' }) as string;

      // Sign a token with the previous key, using the SAME kid the rotated
      // service expects for its previous key.
      const prevService = new JwtService({
        privateKeyPem: prevPrivPem,
        publicKeyPem: prevPubPem,
        keyId: 'prev-key-v1',
      });
      const token = await prevService.signAccessToken({
        sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null,
      });

      // Construct WITHOUT previousKeyExpiresAt — the deadline is frozen ONCE,
      // here, at construction time (now + 30 days).
      const rotatedService = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v2',
        previousPublicKeyPem: prevPubPem,
        previousKeyId: 'prev-key-v1',
      });

      // At T0 the token still verifies.
      await expect(rotatedService.verify(token)).resolves.toBeDefined();

      // Advance the clock 31 days. A sliding (recomputed-on-each-call) deadline
      // would still accept this token; the frozen deadline must reject it.
      vi.setSystemTime(new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000));

      await expect(rotatedService.verify(token)).rejects.toThrow();
    });
  });

  describe('issuer/audience enforcement', () => {
    it('rejects a token signed with a wrong issuer/audience', async () => {
      const evilService = new JwtService({
        privateKeyPem,
        publicKeyPem,
        keyId: 'test-key-v1',
        issuer: 'evil',
        audience: 'evil',
      });
      const token = await evilService.signAccessToken({
        sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null, inspector_id: null,
      });

      // Default-issuer/audience service must reject it.
      await expect(jwtService.verify(token)).rejects.toThrow();
    });

    it('rejects a token lacking iss/aud claims entirely', async () => {
      const key = await importPKCS8(privateKeyPem, 'RS256');
      const token = await new SignJWT({
        tenant_id: null,
        role: 'AM',
        branch_id: null,
        inspector_id: null,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-v1' })
        .setSubject('user-1')
        .setIssuedAt()
        .setExpirationTime('60m')
        // Deliberately no setIssuer()/setAudience()
        .sign(key);

      await expect(jwtService.verify(token)).rejects.toThrow();
    });
  });
});
