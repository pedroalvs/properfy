import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkPropertyIssueAsSeenUseCase } from '../../../src/modules/property-file/application/use-cases/mark-property-issue-seen.use-case';
import type { IPropertyIssueRepository } from '../../../src/modules/property-file/domain/property-issue.repository';
import type { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import { FakeClock } from '../../helpers/fake-clock';
import { makeActor, makeAuthorizationService, fakeAudit, TENANT_A, PROPERTY_A } from './_helpers';

const ISSUE_ID = '66666666-6666-6666-6666-666666666666';

function build(opts: { casRows?: number; deleted?: boolean } = {}) {
  const issue = {
    id: ISSUE_ID, tenantId: TENANT_A, propertyId: PROPERTY_A, appointmentId: null,
    reason: 'x', source: 'STAFF' as const, createdByUserId: null, cantDoEventId: null,
    seenAt: opts.casRows === 0 ? new Date('2026-11-01T00:00:00Z') : null,
    seenByUserId: opts.casRows === 0 ? 'other-user' : null,
    deletedAt: opts.deleted ? new Date() : null, deletedByUserId: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const issueRepo = {
    findById: vi.fn(async () => (opts.deleted ? issue : issue)),
    markSeenCas: vi.fn(async () => opts.casRows ?? 1),
  } as unknown as IPropertyIssueRepository;
  const scope = { assertCanReadIssue: vi.fn(async () => undefined) } as unknown as PropertyScopeService;
  const audit = fakeAudit();
  const uc = new MarkPropertyIssueAsSeenUseCase(
    issueRepo, scope, audit, makeAuthorizationService(), new FakeClock(new Date('2026-11-08T00:00:00Z')),
  );
  return { uc, audit, issueRepo };
}

describe('MarkPropertyIssueAsSeenUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks unseen → seen (1 row) and audits property_issue.seen', async () => {
    const { uc, audit } = build({ casRows: 1 });
    const res = await uc.execute({ actor: makeActor('CL_ADMIN'), issueId: ISSUE_ID });
    expect(res).toMatchObject({ seen: true, alreadySeen: false });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_issue.seen' }));
  });

  it('already seen (0 rows) returns alreadySeen without re-auditing (D23)', async () => {
    const { uc, audit } = build({ casRows: 0 });
    const res = await uc.execute({ actor: makeActor('OP'), issueId: ISSUE_ID });
    expect(res).toMatchObject({ seen: true, alreadySeen: true });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rejects CL_USER and INSP (not in the mark_seen matrix)', async () => {
    const a = build().uc;
    await expect(a.execute({ actor: makeActor('CL_USER'), issueId: ISSUE_ID })).rejects.toThrow();
    const b = build().uc;
    await expect(b.execute({ actor: makeActor('INSP'), issueId: ISSUE_ID })).rejects.toThrow();
  });
});
