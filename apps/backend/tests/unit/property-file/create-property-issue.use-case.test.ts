import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePropertyIssueUseCase } from '../../../src/modules/property-file/application/use-cases/create-property-issue.use-case';
import type { IPropertyFileRepository } from '../../../src/modules/property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../src/modules/property-file/domain/property-issue.repository';
import type { IInspectorAppointmentVisibility } from '../../../src/modules/property-file/domain/inspector-appointment-visibility';
import type { PropertyIssueEntity } from '../../../src/modules/property-file/domain/property-issue.entity';
import { InMemoryIdempotencyService } from '../../helpers/in-memory-idempotency.service';
import { FakeClock } from '../../helpers/fake-clock';
import { makeActor, makeAuthorizationService, makePlatformSettings, fakeAudit, TENANT_A, PROPERTY_A, APPT_A, INSPECTOR_A } from './_helpers';

const ISSUE_ID = '66666666-6666-6666-6666-666666666666';
const EVENT_ID = '77777777-7777-7777-7777-777777777777';
const PHOTO_1 = '88888888-8888-8888-8888-888888888888';

function issueEntity(over: Partial<PropertyIssueEntity> = {}): PropertyIssueEntity {
  return {
    id: ISSUE_ID, tenantId: TENANT_A, propertyId: PROPERTY_A, appointmentId: null,
    reason: 'Broken', source: 'STAFF', createdByUserId: 'u', cantDoEventId: null,
    seenAt: null, seenByUserId: null, deletedAt: null, deletedByUserId: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

function build(opts: { linkCount?: number; event?: { appointmentId: string; inspectorId: string; tenantId: string; type: string } | null } = {}) {
  const linkPendingIssuePhotos = vi.fn(async () => opts.linkCount ?? 0);
  const createdIssues: unknown[] = [];
  const issueRepo = {
    create: vi.fn(async (input) => { createdIssues.push(input); return issueEntity({ source: input.source, appointmentId: input.appointmentId, cantDoEventId: input.cantDoEventId }); }),
    findAppointmentScope: vi.fn(async () => ({ propertyId: PROPERTY_A, tenantId: TENANT_A })),
    findInspectorFieldEventScope: vi.fn(async () =>
      opts.event === undefined
        ? { appointmentId: APPT_A, inspectorId: INSPECTOR_A, tenantId: TENANT_A, type: 'CANT_DO' }
        : opts.event,
    ),
  } as unknown as IPropertyIssueRepository;
  const fileRepo = {
    findPropertyTenantId: vi.fn(async () => TENANT_A),
    linkPendingIssuePhotos,
    listReadyPhotosByIssueIds: vi.fn(async () => []),
  } as unknown as IPropertyFileRepository;
  const visibility = {
    resolveForInspector: vi.fn(async () => ({ propertyId: PROPERTY_A, tenantId: TENANT_A })),
  } as unknown as IInspectorAppointmentVisibility;
  const audit = fakeAudit();
  const uc = new CreatePropertyIssueUseCase(
    undefined, issueRepo, fileRepo, visibility, makePlatformSettings(),
    new InMemoryIdempotencyService(), audit, makeAuthorizationService(),
    new FakeClock(new Date('2026-11-08T00:00:00Z')),
  );
  return { uc, linkPendingIssuePhotos, createdIssues, audit, issueRepo };
}

describe('CreatePropertyIssueUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an Idempotency-Key', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'x' }, idempotencyKey: undefined }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('AM creates a STAFF issue (no appointment) and audits property_issue.created', async () => {
    const { uc, createdIssues, audit } = build();
    const result = await uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'Broken window' }, idempotencyKey: 'c1' });
    expect(result.source).toBe('STAFF');
    expect(createdIssues[0]).toMatchObject({ source: 'STAFF', tenantId: TENANT_A, cantDoEventId: null });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_issue.created' }));
  });

  it('D20: 409 and rollback when not every referenced photo links', async () => {
    const { uc } = build({ linkCount: 1 });
    await expect(
      uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'x', photoFileIds: [PHOTO_1, 'other'] }, idempotencyKey: 'c2' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_PHOTO_LINK_FAILED', statusCode: 409 });
  });

  it('D20: links every photo when the count matches', async () => {
    const { uc, linkPendingIssuePhotos } = build({ linkCount: 1 });
    await uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'x', photoFileIds: [PHOTO_1] }, idempotencyKey: 'c3' });
    expect(linkPendingIssuePhotos).toHaveBeenCalledWith(
      expect.objectContaining({ fileIds: [PHOTO_1], issueId: expect.any(String), propertyId: PROPERTY_A, tenantId: TENANT_A }),
      undefined,
    );
  });

  it('rejects more photos than the per-issue cap', async () => {
    const { uc } = build();
    const tooMany = Array.from({ length: 11 }, (_, i) => `id-${i}`);
    await expect(
      uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'x', photoFileIds: tooMany }, idempotencyKey: 'c4' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_TOO_MANY_PHOTOS' });
  });

  it('INSP derives source INSPECTOR and requires an appointment', async () => {
    const { uc } = build();
    const result = await uc.execute({ actor: makeActor('INSP'), input: { propertyId: PROPERTY_A, appointmentId: APPT_A, reason: 'x' }, idempotencyKey: 'c5' });
    expect(result.source).toBe('INSPECTOR');
    await expect(
      uc.execute({ actor: makeActor('INSP'), input: { propertyId: PROPERTY_A, reason: 'x' }, idempotencyKey: 'c5b' }),
    ).rejects.toThrow();
  });

  it('INSP: rejects a cantDoEventId that is not their own CANT_DO for the appointment', async () => {
    const { uc } = build({ event: { appointmentId: 'other-appt', inspectorId: INSPECTOR_A, tenantId: TENANT_A, type: 'CANT_DO' } });
    await expect(
      uc.execute({ actor: makeActor('INSP'), input: { propertyId: PROPERTY_A, appointmentId: APPT_A, reason: 'x', cantDoEventId: EVENT_ID }, idempotencyKey: 'c6' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_INVALID_CANT_DO_EVENT' });
  });

  it('INSP: accepts a valid own cantDoEventId', async () => {
    const { uc, createdIssues } = build();
    await uc.execute({ actor: makeActor('INSP'), input: { propertyId: PROPERTY_A, appointmentId: APPT_A, reason: 'x', cantDoEventId: EVENT_ID }, idempotencyKey: 'c7' });
    expect(createdIssues[0]).toMatchObject({ cantDoEventId: EVENT_ID, source: 'INSPECTOR' });
  });

  it('is idempotent on replay', async () => {
    const { uc, issueRepo } = build();
    const a = await uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'dup' }, idempotencyKey: 'same' });
    const b = await uc.execute({ actor: makeActor('AM'), input: { propertyId: PROPERTY_A, reason: 'dup' }, idempotencyKey: 'same' });
    expect(b).toEqual(a);
    expect((issueRepo.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
