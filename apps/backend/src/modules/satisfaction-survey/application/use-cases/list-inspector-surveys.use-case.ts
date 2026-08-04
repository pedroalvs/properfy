import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ISatisfactionSurveyRepository } from '../../domain/satisfaction-survey.repository';

export interface ListInspectorSurveysInput {
  inspectorId: string;
  pagination: { page: number; pageSize: number };
  actor: AuthContext;
}

export interface ListInspectorSurveysOutput {
  data: Array<{
    rating: number;
    comment: string | null;
    submittedAt: string;
    appointmentCode: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

const TENANT_PINNED_ROLES = ['CL_ADMIN', 'CL_USER'];

/**
 * Individual satisfaction responses for one inspector.
 *
 * This is the guarded half of the feature. The aggregate (average + counts) is
 * public to everyone who can see the inspector; the responses behind it are not:
 *
 * - AM/OP read every response.
 * - CL_ADMIN/CL_USER read only their own agency's, scoped from the token.
 * - INSP is refused outright, including for its own id. An inspector seeing who
 *   said what invites retaliation, which is the whole reason the PWA shows an
 *   aggregate only.
 *
 * The output carries no respondent name, IP, user agent or raw identifier — the
 * inspection is named by its human code.
 */
export class ListInspectorSurveysUseCase {
  constructor(
    private readonly surveyRepo: ISatisfactionSurveyRepository,
  ) {}

  async execute(input: ListInspectorSurveysInput): Promise<ListInspectorSurveysOutput> {
    const { actor, inspectorId, pagination } = input;

    if (actor.role === 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Inspectors cannot read individual survey responses');
    }

    let tenantScope: string | null = null;
    if (TENANT_PINNED_ROLES.includes(actor.role)) {
      // Fail closed. The repository applies the tenant filter only when this is
      // truthy, so a null scope here would silently widen the read to every
      // agency's responses.
      //
      // TODO: swap for the shared `requireTenantScope` helper once PR #1080 lands.
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      tenantScope = actor.tenantId;
    }

    const { surveys, total } = await this.surveyRepo.findByInspectorId(
      inspectorId,
      tenantScope,
      pagination.page,
      pagination.pageSize,
    );

    return {
      data: surveys.map(({ survey, appointmentCode }) => ({
        rating: survey.rating,
        comment: survey.comment,
        submittedAt: survey.submittedAt.toISOString(),
        appointmentCode,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
