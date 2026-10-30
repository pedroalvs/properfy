import type { AuthContext, PaymentSettings, InspectorBaseAddress } from '@properfy/shared';
import { inspectorBaseAddressSchema } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { isSameGeocodingAddress, type GeocodableAddress } from '../../../../shared/domain/geocoding-address';
import { geocodeInspectorBase } from '../services/geocode-inspector-base';
import { INSPECTOR_EVENTS } from '../../domain/inspector-events';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

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

      const currentParsed = inspectorBaseAddressSchema.safeParse(inspector.address);
      const sameAsStored =
        currentParsed.success &&
        hadCoordinates &&
        isSameGeocodingAddress(
          currentParsed.data as unknown as GeocodableAddress,
          next as unknown as GeocodableAddress,
        );

      if (sameAsStored) {
        baseChanged = false;
      } else if (this.geocodingService) {
        const geo = await geocodeInspectorBase(this.geocodingService, next, this.logger, this.clock);
        if ('lat' in geo) {
          updateData.baseLat = geo.lat;
          updateData.baseLng = geo.lng;
          updateData.baseGeocodedAt = geo.geocodedAt;
          hasCoordinates = true;
        } else {
          updateData.baseLat = null;
          updateData.baseLng = null;
          updateData.baseGeocodedAt = null;
          baseGeocodeFailed = true;
          hasCoordinates = false;
        }
      } else {
        updateData.baseLat = null;
        updateData.baseLng = null;
        updateData.baseGeocodedAt = null;
        hasCoordinates = false;
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
