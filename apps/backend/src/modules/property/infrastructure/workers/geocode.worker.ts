import type { IPropertyRepository } from '../../domain/property.repository';
import {
  type IGeocodingService,
  MapboxPermanentGeocodingUnavailableError,
} from '../../domain/geocoding.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { metrics } from '../../../../shared/infrastructure/metrics';

export class GeocodeWorker {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly geocodingService: IGeocodingService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(data: { propertyId: string }): Promise<void> {
    const { propertyId } = data;
    // Background worker — cross-tenant by design (no actor, just a job
    // payload). `null` makes the intent explicit; the old `''` sentinel
    // only worked because the repo's `buildWhere` treats it as falsy.
    const property = await this.propertyRepo.findById(propertyId, null);
    if (!property) {
      // findById excludes soft-deleted rows. Distinguish a legitimate soft-delete
      // (no-op is correct) from a row that does not exist in THIS database at all —
      // the signature of a cross-environment queue consumer (a process whose
      // DATABASE_URL differs from where the row lives) or a hard-deleted row.
      const existsAnywhere = await this.propertyRepo.existsById(propertyId);
      if (existsAnywhere) {
        this.logger.warn({ propertyId }, 'Property soft-deleted, skipping geocoding');
        return;
      }
      // Fail loudly: let pg-boss retry and surface the job in the DLQ instead of
      // silently completing as a no-op and stranding the property in PENDING.
      throw new Error(
        `property.geocode: property ${propertyId} not found in this database ` +
          `(possible cross-environment queue consumer or hard-deleted row)`,
      );
    }

    if (
      property.geocodingStatus === 'MANUAL' ||
      property.geocodingStatus === 'SUCCESS'
    ) {
      this.logger.info(
        { propertyId },
        'Property already geocoded or manual, skipping',
      );
      return;
    }

    const fullAddress = property.fullAddress;

    let result: { lat: number; lng: number } | null;
    try {
      result = await this.geocodingService.geocode(fullAddress, { mode: 'permanent' });
    } catch (err) {
      if (err instanceof MapboxPermanentGeocodingUnavailableError) {
        // Account cannot do permanent geocoding: mark FAILED with a code so the
        // retry sweep skips it (no re-billing per day), store no coordinate, and
        // resolve WITHOUT throwing so pg-boss does not retry either.
        await this.propertyRepo.update(propertyId, property.tenantId, {
          geocodingStatus: 'FAILED',
          geocodingFailureCode: err.code,
        });
        this.auditService.log({
          action: 'property.geocoding_failed',
          actorType: 'SYSTEM',
          entityType: 'Property',
          entityId: property.id,
          tenantId: property.tenantId,
          metadata: {
            address: fullAddress,
            reason: `${err.code}: Mapbox account does not allow permanent geocoding`,
            code: err.code,
          },
        });
        this.logger.error(
          { propertyId, code: err.code },
          'Mapbox permanent geocoding unavailable; property marked FAILED without retry',
        );
        await this.updateFailedGauge();
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await this.propertyRepo.update(propertyId, property.tenantId, {
        geocodingStatus: 'FAILED',
      });
      this.auditService.log({
        action: 'property.geocoding_failed',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: property.id,
        tenantId: property.tenantId,
        metadata: { address: fullAddress, reason: `Geocoding service error: ${errorMessage}` },
      });
      this.logger.error({ propertyId, error: err }, 'Geocoding service threw an error');
      await this.updateFailedGauge();
      return;
    }

    if (result) {
      await this.propertyRepo.update(propertyId, property.tenantId, {
        lat: result.lat,
        lng: result.lng,
        geocodingStatus: 'SUCCESS',
        geocodedPermanentlyAt: new Date(),
        geocodingFailureCode: null,
      });
      this.logger.info(
        { propertyId, lat: result.lat, lng: result.lng },
        'Property geocoded successfully',
      );
    } else {
      await this.propertyRepo.update(propertyId, property.tenantId, {
        geocodingStatus: 'FAILED',
      });
      this.auditService.log({
        action: 'property.geocoding_failed',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: property.id,
        tenantId: property.tenantId,
        metadata: { address: fullAddress, reason: 'Geocoding service returned no results' },
      });
      this.logger.warn({ propertyId }, 'Geocoding failed for property');
      await this.updateFailedGauge();
    }
  }

  private async updateFailedGauge(): Promise<void> {
    try {
      const count = await this.propertyRepo.countFailedGeocoding();
      metrics.setGeocodingFailedCount(count);
    } catch {
      // Non-critical — metric update failure should not affect the worker
    }
  }
}
