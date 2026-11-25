import type { AuthContext, PaymentSettings, InspectorBaseAddress } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { isSameGeocodingAddress, type GeocodableAddress } from '../../../../shared/domain/geocoding-address';
import {
  geocodeInspectorBase,
  inspectorBaseRejectionReason,
} from '../services/geocode-inspector-base';
import { INSPECTOR_EVENTS } from '../../domain/inspector-events';
import {
  InspectorNotFoundError,
  InspectorBaseAddressNotVerifiedError,
} from '../../domain/inspector.errors';

export interface UpdateInspectorSelfProfileInput {
  inspectorId: string;
  data: {
    phone?: string | null;
    fullName?: string | null;
    paymentSettings?: PaymentSettings;
    address?: InspectorBaseAddress;
  };
  actor: AuthContext;
}

export interface UpdateInspectorSelfProfileOutput {
  inspectorId: string;
  /** Present only when `address` was supplied; true when geocoding did not locate it. */
  baseGeocodeFailed?: boolean;
}

export class UpdateInspectorSelfProfileUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    // Optional and LAST so existing wirings and untyped test constructors keep
    // compiling. A geocoding failure never fails the self-update.
    private readonly geocodingService?: IGeocodingService,
    private readonly eventBus?: DomainEventBus,
    private readonly logger?: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: UpdateInspectorSelfProfileInput): Promise<UpdateInspectorSelfProfileOutput> {
    const { inspectorId, data, actor } = input;

    // INSP only, self only
    if (actor.role !== 'INSP' || actor.inspectorId !== inspectorId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Inspectors can only update their own profile');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const hadCoordinates = inspector.baseLat !== null;
    const before = {
      phone: inspector.phone,
      fullName: inspector.fullName,
      paymentSettingsJson: inspector.paymentSettingsJson,
      // Base-address audit WITHOUT raw coordinates (L-F01-10 / root §7.9).
      address: inspector.address,
      baseLocated: hadCoordinates,
      baseGeocodedAt: inspector.baseGeocodedAt,
    };

    const updateData: Parameters<IInspectorRepository['update']>[1] = {};
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;

    // F01-1: base address — same geocode-before-write / same-address rules as the
    // OP update (L-F01-11, D18).
    let baseGeocodeFailed = false;
    let baseChanged = false;
    let hasCoordinates = hadCoordinates;
    if (data.address !== undefined) {
      const next = data.address;
      updateData.address = data.address as unknown as Record<string, unknown>;
      baseChanged = true;

      // V-3/V10 — mirrors update-branch.use-case / update-inspector. Compared via the
      // X02 helper on the RAW stored address (parse-tolerant), NOT the AU schema:
      //   - unchanged + HAS coordinate → skip;
      //   - unchanged + NO coordinate → geocode as a RECOVERY attempt, but a rejection
      //     NEVER 422s (save without a coordinate + baseGeocodeFailed, V10);
      //   - CHANGED → geocode → a rule-A rejection throws 422 (nothing written).
      const sameAsStored =
        inspector.address != null &&
        typeof inspector.address === 'object' &&
        isSameGeocodingAddress(
          inspector.address as unknown as GeocodableAddress,
          next as unknown as GeocodableAddress,
        );

      if (sameAsStored && hadCoordinates) {
        baseChanged = false;
      } else if (this.geocodingService) {
        const geo = await geocodeInspectorBase(this.geocodingService, next, this.logger, this.clock);
        if ('lat' in geo) {
          updateData.baseLat = geo.lat;
          updateData.baseLng = geo.lng;
          updateData.baseGeocodedAt = geo.geocodedAt;
          hasCoordinates = true;
        } else {
          const reason = inspectorBaseRejectionReason(geo.failed);
          // Only a CHANGED address that fails rule A is rejected (422). A rejection on
          // an UNCHANGED base (recovery) or a provider-unavailable failure saves
          // without a coordinate (V4/V10).
          if (reason && !sameAsStored) {
            throw new InspectorBaseAddressNotVerifiedError(reason);
          }
          updateData.baseLat = null;
          updateData.baseLng = null;
          updateData.baseGeocodedAt = null;
          baseGeocodeFailed = true;
          hasCoordinates = false;
          baseChanged = !sameAsStored;
        }
      } else {
        updateData.baseLat = null;
        updateData.baseLng = null;
        updateData.baseGeocodedAt = null;
        hasCoordinates = false;
        baseChanged = !sameAsStored;
      }
    }

    await this.inspectorRepo.update(inspectorId, updateData);

    this.auditService.log({
      action: 'inspector.self_profile_updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before,
      // Gate on `!== undefined`, not `??`: an explicit `null` clear must be
      // recorded as null in the audit trail, not silently rewritten to the old
      // value. Mirrors the `updateData` construction above.
      after: {
        phone: data.phone !== undefined ? data.phone : inspector.phone,
        fullName: data.fullName !== undefined ? data.fullName : inspector.fullName,
        paymentSettingsJson:
          data.paymentSettings !== undefined ? data.paymentSettings : inspector.paymentSettingsJson,
        address: data.address !== undefined ? data.address : inspector.address,
        baseLocated: hasCoordinates,
        baseGeocodedAt:
          'baseGeocodedAt' in updateData
            ? (updateData.baseGeocodedAt as Date | null)
            : inspector.baseGeocodedAt,
      },
    });

    if (baseChanged && this.eventBus) {
      try {
        await this.eventBus.emit({
          type: INSPECTOR_EVENTS.BASE_CHANGED,
          payload: { inspectorId, hadCoordinates, hasCoordinates },
          occurredAt: new Date(),
        });
      } catch (err) {
        this.logger?.warn(
          { inspectorId, err: err instanceof Error ? err.message : String(err) },
          'inspector.base_changed_emit_failed',
        );
      }
    }

    return { inspectorId, ...(data.address !== undefined ? { baseGeocodeFailed } : {}) };
  }
}
