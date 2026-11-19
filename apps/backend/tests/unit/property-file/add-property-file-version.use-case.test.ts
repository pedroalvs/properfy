import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { AddPropertyFileVersionUseCase } from '../../../src/modules/property-file/application/use-cases/add-property-file-version.use-case';
import type { IPropertyFileRepository } from '../../../src/modules/property-file/domain/property-file.repository';
import type { PropertyFileEntity } from '../../../src/modules/property-file/domain/property-file.entity';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import { FakeClock } from '../../helpers/fake-clock';
import { makeActor, makeAuthorizationService, makePlatformSettings, TENANT_A, PROPERTY_A } from './_helpers';

const SRC_ID = '99999999-9999-9999-9999-999999999999';

function source(): PropertyFileEntity {
  return {
    id: SRC_ID, tenantId: TENANT_A, propertyId: PROPERTY_A, appointmentId: null, issueId: null,
    type: 'DOCUMENT', versionGroupId: 'group-1', version: 1, fileName: 'a.pdf', mime: 'application/pdf',
    sizeBytes: 10, storageKey: 'k', status: 'READY', confirmedAt: new Date(), uploadedByUserId: 'u',
    deletedAt: null, deletedByUserId: null, purgedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002', clientVersion: 'test', meta: { target: ['version_group_id', 'version'] },
  });
}

describe('AddPropertyFileVersionUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates version max+1 and returns a fresh presign', async () => {
    const maxVersion = vi.fn(async () => 2);
    const create = vi.fn(async (i) => i);
    const fileRepo = { findById: vi.fn(async () => source()), maxVersion, create } as unknown as IPropertyFileRepository;
    const storage = { createSignedUploadUrl: vi.fn(async (_b, key) => ({ url: `u/${key}`, storageKey: key })) } as unknown as IStorageService;
    const scope = { assertCanReadFile: vi.fn(async () => undefined) } as unknown as PropertyScopeService;
    const uc = new AddPropertyFileVersionUseCase(fileRepo, storage, makePlatformSettings(), scope, makeAuthorizationService(), new FakeClock(new Date()));
    await uc.execute({ actor: makeActor('AM'), sourceFileId: SRC_ID, input: { fileName: 'a-v3.pdf', mime: 'application/pdf' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 3, versionGroupId: 'group-1', status: 'PENDING' }));
  });

  it('retries on a unique-version conflict (P2002) with a recomputed max', async () => {
    const maxVersion = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const create = vi.fn().mockRejectedValueOnce(p2002()).mockResolvedValueOnce(undefined);
    const fileRepo = { findById: vi.fn(async () => source()), maxVersion, create } as unknown as IPropertyFileRepository;
    const storage = { createSignedUploadUrl: vi.fn(async (_b, key) => ({ url: 'u', storageKey: key })) } as unknown as IStorageService;
    const scope = { assertCanReadFile: vi.fn(async () => undefined) } as unknown as PropertyScopeService;
    const uc = new AddPropertyFileVersionUseCase(fileRepo, storage, makePlatformSettings(), scope, makeAuthorizationService(), new FakeClock(new Date()));
    await uc.execute({ actor: makeActor('OP'), sourceFileId: SRC_ID, input: { fileName: 'v.pdf', mime: 'application/pdf' } });
    expect(maxVersion).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: 4 }));
  });

  it('rejects CL_USER / INSP (version is AM/OP/CL_ADMIN only)', async () => {
    const fileRepo = { findById: vi.fn(async () => source()), maxVersion: vi.fn(), create: vi.fn() } as unknown as IPropertyFileRepository;
    const storage = { createSignedUploadUrl: vi.fn() } as unknown as IStorageService;
    const scope = { assertCanReadFile: vi.fn(async () => undefined) } as unknown as PropertyScopeService;
    const uc = new AddPropertyFileVersionUseCase(fileRepo, storage, makePlatformSettings(), scope, makeAuthorizationService(), new FakeClock(new Date()));
    await expect(uc.execute({ actor: makeActor('INSP'), sourceFileId: SRC_ID, input: { fileName: 'v.pdf', mime: 'application/pdf' } })).rejects.toThrow();
  });
});
