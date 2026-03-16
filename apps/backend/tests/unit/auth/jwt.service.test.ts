import { describe, it, expect, beforeAll } from 'vitest';
import { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import { generateKeyPairSync } from 'crypto';

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
    });
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
    const ctx = await jwtService.verify(token);
    expect(ctx.userId).toBe('user-1');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.role).toBe('CL_ADMIN');
    expect(ctx.branchId).toBeNull();
  });

  it('should reject a tampered token', async () => {
    const token = await jwtService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null });
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
    const tokenFromWrongKey = await wrongKeyService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null });
    await expect(jwtService.verify(tokenFromWrongKey)).rejects.toThrow();
  });

  it('should handle null tenantId and branchId', async () => {
    const token = await jwtService.signAccessToken({ sub: 'user-1', tenant_id: null, role: 'AM', branch_id: null });
    const ctx = await jwtService.verify(token);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.branchId).toBeNull();
  });
});
