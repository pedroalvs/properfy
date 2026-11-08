import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_PROPERTY_FILES_SETTING, PORTAL_MAX_PHOTOS_PER_ISSUE } from '@properfy/shared';
import type { PropertyFilesSetting } from '@properfy/shared';
import { CreatePortalIssueUseCase } from '../create-portal-issue.use-case';
import type { IPropertyIssueRepository } from '../../../../property-file/domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../../../property-file/domain/property-file.repository';
import type { PropertyIssueEntity } from '../../../../property-file/domain/property-issue.entity';
import type { IPlatformSettingsReader } from '../../../../../shared/domain/platform-settings';
import type { IIdempotencyService } from '../../../../../shared/domain/idempotency.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROPERTY_A = '11111111-1111-1111-1111-111111111111';
const APPT_A = '22222222-2222-2222-2222-222222222222';
const PHOTO_1 = '88888888-8888-8888-8888-888888888888';
const NOW = new Date('2026-11-07T00:00:00.000Z');

function platformSettings(overrides: Partial<PropertyFilesSetting> = {}): IPlatformSettingsReader {
  const config = { ...DEFAULT_PROPERTY_FILES_SETTING, ...overrides };
  return { get: vi.fn(async () => config as never) } as unknown as IPlatformSettingsReader;
}

function inMemoryIdempotency(): IIdempotencyService {
  const store = new Map<string, { response: unknown; payloadHash: string | null }>();
  const keyOf = (k: string, s: string) => `${s}::${k}`;
  return {
    getWithHash: vi.fn(async (k: string, s: string) => store.get(keyOf(k, s)) ?? null),
    set: vi.fn(async (k: string, s: string, response: unknown, _ttl: number, payloadHash?: string) => {
      store.set(keyOf(k, s), { response, payloadHash: payloadHash ?? null });
    }),
    get: vi.fn(),
    tryAcquire: vi.fn(),
    complete: vi.fn(),
    renew: vi.fn(),
    release: vi.fn(),
  } as unknown as IIdempotencyService;
}

function issueEntity(over: Partial<PropertyIssueEntity> = {}): PropertyIssueEntity {
  return {
    id: 'issue-1',
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    appointmentId: APPT_A,
    reason: 'The gate will not lock',
    source: 'RENTAL_TENANT_PORTAL',
    createdByUserId: null,
    cantDoEventId: null,
    seenAt: null,
    seenByUserId: null,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function build(opts: { propertyId?: string | null; linkCount?: number } = {}) {
  const created: Record<string, unknown>[] = [];
  const linkPendingIssuePhotos = vi.fn(async () => opts.linkCount ?? 0);
  const issueRepo = {
    findAppointmentScope: vi.fn(async () => ({
      propertyId: opts.propertyId === undefined ? PROPERTY_A : opts.propertyId,
      tenantId: TENANT_A,
    })),
    create: vi.fn(async (input: Record<string, unknown>) => {
      created.push(input);
      return issueEntity({
        id: input.id as string,
        source: input.source as PropertyIssueEntity['source'],
        createdByUserId: input.createdByUserId as string | null,
      });
    }),
  } as unknown as IPropertyIssueRepository;
  const fileRepo = {
    linkPendingIssuePhotos,
    listReadyPhotosByIssueIds: vi.fn(async () => []),
  } as unknown as IPropertyFileRepository;
  const audit = { log: vi.fn() };
  const uc = new CreatePortalIssueUseCase(
    undefined,
    issueRepo,
    fileRepo,
    platformSettings(),
    inMemoryIdempotency(),
    audit,
    { now: () => NOW },
  );
  return { uc, created, linkPendingIssuePhotos, audit, issueRepo };
}

describe('CreatePortalIssueUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an Idempotency-Key', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { reason: 'x' }, idempotencyKey: undefined }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('creates a RENTAL_TENANT_PORTAL issue with no user and audits (ANONYMOUS)', async () => {
    const { uc, created, audit } = build();
    const res = await uc.execute({
      appointmentId: APPT_A,
      input: { reason: 'The gate will not lock' },
      idempotencyKey: 'c1',
    });
    expect(res.reason).toBe('The gate will not lock');
    expect(res.photos).toEqual([]);
    expect(created[0]).toMatchObject({
      source: 'RENTAL_TENANT_PORTAL',
      createdByUserId: null,
      cantDoEventId: null,
      tenantId: TENANT_A,
      propertyId: PROPERTY_A,
      appointmentId: APPT_A,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'property_issue.created',
        actorType: 'ANONYMOUS',
        tenantId: TENANT_A,
        after: expect.objectContaining({ source: 'RENTAL_TENANT_PORTAL', appointmentId: APPT_A }),
      }),
    );
    // No authenticated actor id on a portal audit.
    expect(audit.log).toHaveBeenCalledWith(expect.not.objectContaining({ actorId: expect.anything() }));
  });

  it('rejects when the appointment has no property (422)', async () => {
    const { uc } = build({ propertyId: null });
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { reason: 'x' }, idempotencyKey: 'c2' }),
    ).rejects.toMatchObject({ code: 'PORTAL_ISSUE_NO_PROPERTY', statusCode: 422 });
  });

  it('caps photos at min(PORTAL_MAX_PHOTOS_PER_ISSUE, maxPhotosPerIssue)', async () => {
    const { uc } = build();
    const tooMany = Array.from({ length: PORTAL_MAX_PHOTOS_PER_ISSUE + 1 }, (_, i) =>
      `${i}`.padStart(8, '0') + '-0000-0000-0000-000000000000',
    );
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { reason: 'x', photoFileIds: tooMany }, idempotencyKey: 'c3' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_TOO_MANY_PHOTOS' });
  });

  it('D20: 409 + rollback when not every referenced photo links', async () => {
    const { uc } = build({ linkCount: 1 });
    await expect(
      uc.execute({
        appointmentId: APPT_A,
        input: { reason: 'x', photoFileIds: [PHOTO_1, '77777777-7777-7777-7777-777777777777'] },
        idempotencyKey: 'c4',
      }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_PHOTO_LINK_FAILED', statusCode: 409 });
  });

  it('D20: links every photo within the token scope when the count matches', async () => {
    const { uc, linkPendingIssuePhotos } = build({ linkCount: 1 });
    await uc.execute({
      appointmentId: APPT_A,
      input: { reason: 'x', photoFileIds: [PHOTO_1] },
      idempotencyKey: 'c5',
    });
    expect(linkPendingIssuePhotos).toHaveBeenCalledWith(
      expect.objectContaining({
        fileIds: [PHOTO_1],
        issueId: expect.any(String),
        propertyId: PROPERTY_A,
        appointmentId: APPT_A,
        tenantId: TENANT_A,
      }),
      undefined,
    );
  });

  it('is idempotent on replay (same key → same issue, created once)', async () => {
    const { uc, issueRepo } = build();
    const a = await uc.execute({ appointmentId: APPT_A, input: { reason: 'dup' }, idempotencyKey: 'same' });
    const b = await uc.execute({ appointmentId: APPT_A, input: { reason: 'dup' }, idempotencyKey: 'same' });
    expect(b).toEqual(a);
    expect(issueRepo.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
