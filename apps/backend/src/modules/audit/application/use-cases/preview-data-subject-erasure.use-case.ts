import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import type { IDataSubjectErasureRequestRepository } from '../../domain/data-subject-erasure-request.repository';
import type { IAuditLogRepository, PiiSearchMatch } from '../../domain/audit-log.repository';
import type { IPiiFieldMappingRepository } from '../../domain/pii-field-mapping.repository';
import type {
  IErasurePiiResolver,
  DataSubjectIdentifierType,
} from '../../domain/erasure-pii-resolver';
import { DataSubjectErasureRequestEntity } from '../../domain/data-subject-erasure-request.entity';
import { ErasureForbiddenError } from '../../domain/audit.errors';

export interface PreviewDataSubjectErasureInput {
  subjectIdentifierType: DataSubjectIdentifierType;
  subjectIdentifierValue: string;
  actor: AuthContext;
}

export interface PreviewDataSubjectErasureOutput {
  requestId: string;
  status: string;
  canonicalUserId: string | null;
  resolvedPiiValues: string[];
  totalFound: number;
  byCategory: {
    FINANCIAL: number;
    OPERATIONAL_CRITICAL: number;
    OPERATIONAL_GENERAL: number;
    uncategorized: number;
  };
  byTier: {
    hot: number;
    cold: number;
    rentalTenantPortalHot: number;
    rentalTenantPortalCold: number;
  };
  entriesFlaggedForReview: number;
}

interface RentalTenantPortalMatch {
  id: string;
  isArchived: boolean;
}

/**
 * Feature 020 FR-014 / FR-019: AM-only preview phase of the data subject
 * erasure workflow.
 *
 * Flow:
 *   1. Enforce AM role
 *   2. Persist a new `DataSubjectErasureRequest` (status=PENDING)
 *   3. Transition to SCANNING
 *   4. Call `erasurePiiResolver.resolve()` to collect historical PII values
 *   5. Scan hot + cold `audit_logs` via `searchPiiByValues`
 *   6. Scan hot + cold `rental_tenant_portal_activities` in parallel
 *   7. Classify matches by category + tier
 *   8. Flag matches whose action has no registered PII field mapping as
 *      "requires manual review" (FR-018)
 *   9. Persist preview on the request, transition to PREVIEW
 *  10. Return the preview summary to the caller
 */
export class PreviewDataSubjectErasureUseCase {
  constructor(
    private readonly erasureRequestRepo: IDataSubjectErasureRequestRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly piiFieldMappingRepo: IPiiFieldMappingRepository,
    private readonly erasurePiiResolver: IErasurePiiResolver,
    private readonly prisma: PrismaClient,
  ) {}

  async execute(input: PreviewDataSubjectErasureInput): Promise<PreviewDataSubjectErasureOutput> {
    if (input.actor.role !== 'AM') {
      throw new ErasureForbiddenError();
    }

    // 1. Create the request in PENDING
    const request = new DataSubjectErasureRequestEntity({
      id: crypto.randomUUID(),
      subjectIdentifierType: input.subjectIdentifierType,
      subjectIdentifierValue: input.subjectIdentifierValue,
      resolvedPiiValuesJson: null,
      status: 'PENDING',
      entriesFoundCount: null,
      entriesRedactedCount: null,
      entriesFlaggedForReviewCount: null,
      completionReportJson: null,
      initiatedByUserId: input.actor.userId,
      initiatedAt: new Date(),
      completedAt: null,
    });
    await this.erasureRequestRepo.save(request);

    // 2. Mark SCANNING + resolve historical PII
    request.markScanning();
    await this.erasureRequestRepo.update(request);

    const resolved = await this.erasurePiiResolver.resolve({
      type: input.subjectIdentifierType,
      value: input.subjectIdentifierValue,
    });

    // 3. Load PII field registry to determine field paths + classify matches
    const mappings = await this.piiFieldMappingRepo.findAll();
    const allFieldPaths = mappings.map((m) => m.jsonFieldPath);

    // 4. Scan hot + cold audit_logs
    const auditMatches: PiiSearchMatch[] =
      resolved.piiValues.length > 0
        ? await this.auditLogRepo.searchPiiByValues(resolved.piiValues, allFieldPaths, {
            includeArchived: true,
          })
        : [];

    // 5. Scan hot + cold rental_tenant_portal_activities
    const portalMatches =
      resolved.piiValues.length > 0 ? await this.scanRentalTenantPortalActivities(resolved.piiValues) : { hot: [], cold: [] };

    // 6. Classify
    const byCategory = {
      FINANCIAL: 0,
      OPERATIONAL_CRITICAL: 0,
      OPERATIONAL_GENERAL: 0,
      uncategorized: 0,
    };
    const byTier = {
      hot: 0,
      cold: 0,
      rentalTenantPortalHot: portalMatches.hot.length,
      rentalTenantPortalCold: portalMatches.cold.length,
    };
    let flaggedForReview = 0;

    const mappingsByActionPrefix = new Map<string, boolean>();
    for (const mapping of mappings) {
      mappingsByActionPrefix.set(mapping.actionPattern, true);
    }

    for (const match of auditMatches) {
      if (match.isArchived) byTier.cold++;
      else byTier.hot++;

      if (match.retentionCategory === 'FINANCIAL') byCategory.FINANCIAL++;
      else if (match.retentionCategory === 'OPERATIONAL_CRITICAL') byCategory.OPERATIONAL_CRITICAL++;
      else if (match.retentionCategory === 'OPERATIONAL_GENERAL') byCategory.OPERATIONAL_GENERAL++;
      else byCategory.uncategorized++;

      // A match whose action does not have any registered PII field mapping is
      // flagged for manual review (FR-018) — the scan found something by raw
      // text, but we can't safely redact any field automatically.
      const hasMapping = mappings.some((m) => m.appliesTo(match.action));
      if (!hasMapping) flaggedForReview++;
    }

    const totalFound =
      auditMatches.length + portalMatches.hot.length + portalMatches.cold.length;

    request.markPreview(totalFound, flaggedForReview, resolved.piiValues);
    await this.erasureRequestRepo.update(request);

    return {
      requestId: request.id,
      status: request.status,
      canonicalUserId: resolved.canonicalUserId,
      resolvedPiiValues: resolved.piiValues,
      totalFound,
      byCategory,
      byTier,
      entriesFlaggedForReview: flaggedForReview,
    };
  }

  /**
   * Scans `rental_tenant_portal_activities` and `rental_tenant_portal_activities_archive`
   * using the same ILIKE-ANY strategy as `searchPiiByValues`. Returns id-only
   * matches grouped by tier.
   */
  private async scanRentalTenantPortalActivities(
    values: string[],
  ): Promise<{ hot: RentalTenantPortalMatch[]; cold: RentalTenantPortalMatch[] }> {
    if (values.length === 0) return { hot: [], cold: [] };
    const likePatterns = values.map((v) => `%${v}%`);

    const hotRows: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM "rental_tenant_portal_activities"
       WHERE previous_values_json::text ILIKE ANY($1::text[])
          OR new_values_json::text ILIKE ANY($1::text[])
       LIMIT 5000`,
      likePatterns,
    );
    const coldRows: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM "rental_tenant_portal_activities_archive"
       WHERE previous_values_json::text ILIKE ANY($1::text[])
          OR new_values_json::text ILIKE ANY($1::text[])
       LIMIT 5000`,
      likePatterns,
    );

    return {
      hot: hotRows.map((r) => ({ id: r.id, isArchived: false })),
      cold: coldRows.map((r) => ({ id: r.id, isArchived: true })),
    };
  }
}
