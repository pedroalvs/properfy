import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
} from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IInspectorRatingReader } from '../../domain/inspector-rating.reader';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

export interface GetInspectorInput {
  inspectorId: string;
  actor: AuthContext;
}

export interface GetInspectorOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paymentSettingsJson: PaymentSettings;
  regionIds: string[];
  serviceTypesJson: ServiceTypeEntry[];
  blockedClients: string[];
  fullName: string | null;
  address: Record<string, unknown> | null;
  abn: string | null;
  dateOfBirth: Date | null;
  insuranceFileKey: string | null;
  insuranceExpiresAt: Date | null;
  policeCheckFileKey: string | null;
  policeCheckExpiresAt: Date | null;
  /** Aggregate reputation only — never individual ratings or comments. */
  rating: { average: number | null; responseCount: number; doneServicesCount: number };
  createdAt: Date;
  updatedAt: Date;
}

export class GetInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    // Optional so existing construction keeps working.
    private readonly ratingReader?: IInspectorRatingReader,
  ) {}

  async execute(input: GetInspectorInput): Promise<GetInspectorOutput> {
    const { inspectorId, actor } = input;

    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (inspectorId !== actor.inspectorId) {
        throw new ForbiddenError('FORBIDDEN', "Cannot access another inspector's data");
      }
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    // CL_ADMIN and CL_USER can only see eligible inspectors
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId || !inspector.isEligibleForTenant(actor.tenantId)) {
        throw new InspectorNotFoundError();
      }
    }

    const regionIds = await this.serviceRegionRepo.getInspectorRegionIds(inspector.id);
    const aggregate = this.ratingReader
      ? (await this.ratingReader.getAggregatesByInspectorIds([inspector.id])).get(inspector.id)
      : undefined;

    return {
      id: inspector.id,
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionIds,
      serviceTypesJson: inspector.serviceTypesJson,
      blockedClients: inspector.blockedClientsJson,
      fullName: inspector.fullName,
      address: inspector.address,
      abn: inspector.abn,
      dateOfBirth: inspector.dateOfBirth,
      insuranceFileKey: inspector.insuranceFileKey,
      insuranceExpiresAt: inspector.insuranceExpiresAt,
      policeCheckFileKey: inspector.policeCheckFileKey,
      policeCheckExpiresAt: inspector.policeCheckExpiresAt,
      rating: {
        // null, never 0 — see IInspectorRatingReader.
        average: aggregate?.averageRating ?? null,
        responseCount: aggregate?.responseCount ?? 0,
        doneServicesCount: aggregate?.doneServicesCount ?? 0,
      },
      createdAt: inspector.createdAt,
      updatedAt: inspector.updatedAt,
    };
  }
}
