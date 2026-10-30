import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { InspectorStatus as PrismaInspectorStatus } from '@prisma/client';
import { InspectorEntity } from '../domain/inspector.entity';
import type {
  IInspectorRepository,
  InspectorFilters,
  PaginationParams,
  RecordAppStateParams,
} from '../domain/inspector.repository';
import type {
  InspectorStatus,
  PaymentSettings,
  ServiceTypeEntry,
  AvailabilityTemplate,
  BillingPeriodType,
} from '@properfy/shared';
import { availabilityTemplateSchema } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  payment_settings_json: unknown;
  service_types_json: unknown;
  blocked_clients_json: unknown;
  full_name: string | null;
  address: unknown;
  base_lat: Prisma.Decimal | null;
  base_lng: Prisma.Decimal | null;
  base_geocoded_at: Date | null;
  app_installed_at: Date | null;
  app_last_seen_at: Date | null;
  push_enabled: boolean | null;
  app_version: string | null;
  abn: string | null;
  date_of_birth: Date | null;
  insurance_file_key: string | null;
  insurance_expires_at: Date | null;
  insurance_meta_json: unknown;
  police_check_file_key: string | null;
  police_check_expires_at: Date | null;
  police_check_meta_json: unknown;
  photo_storage_key: string | null;
  availability_template_json: unknown;
  billing_cycle: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): InspectorEntity {
  return new InspectorEntity({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status as InspectorStatus,
    paymentSettingsJson:
      (row.payment_settings_json as PaymentSettings) ?? {},
    serviceTypesJson: (row.service_types_json as ServiceTypeEntry[]) ?? [],
    blockedClientsJson: Array.isArray(row.blocked_clients_json) ? (row.blocked_clients_json as string[]) : [],
    fullName: row.full_name ?? null,
    address: row.address as Record<string, unknown> | null,
    // Decimal(10,7) ↔ number, like the property repo. Explicit null check: a 0
    // latitude is a legitimate value and must not be treated as "absent".
    baseLat: row.base_lat == null ? null : row.base_lat.toNumber(),
    baseLng: row.base_lng == null ? null : row.base_lng.toNumber(),
    baseGeocodedAt: row.base_geocoded_at ?? null,
    appInstalledAt: row.app_installed_at ?? null,
    appLastSeenAt: row.app_last_seen_at ?? null,
    pushEnabled: row.push_enabled ?? null,
    appVersion: row.app_version ?? null,
    abn: row.abn ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    insuranceFileKey: row.insurance_file_key ?? null,
    insuranceExpiresAt: row.insurance_expires_at ?? null,
    insuranceMetaJson: row.insurance_meta_json as Record<string, unknown> | null ?? null,
    policeCheckFileKey: row.police_check_file_key ?? null,
    policeCheckExpiresAt: row.police_check_expires_at ?? null,
    policeCheckMetaJson: row.police_check_meta_json as Record<string, unknown> | null ?? null,
    photoStorageKey: row.photo_storage_key ?? null,
    availabilityTemplateJson: (row.availability_template_json as Record<string, unknown>) ?? {},
    billingCycle: (row.billing_cycle as BillingPeriodType | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaInspectorRepository implements IInspectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByEmail(email: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { email, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { user_id: userId, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async linkUserId(inspectorId: string, userId: string): Promise<void> {
    await this.prisma.inspector.update({
      where: { id: inspectorId },
      data: { user_id: userId },
    });
  }

  async findAll(
    filters: InspectorFilters,
    pagination: PaginationParams,
  ): Promise<InspectorEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.inspector.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });

    return rows.map(mapToEntity);
  }

  async count(filters: InspectorFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.inspector.count({ where });
  }

  async save(inspector: InspectorEntity): Promise<void> {
    await this.prisma.inspector.create({
      data: {
        id: inspector.id,
        // Without this the inspector never resolves from their login account: the
        // JWT carries inspectorId: null, inspector-scoped routes reject with a
        // mix of 400/403/404, and password resets report no linked account.
        user_id: inspector.userId,
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone,
        status: inspector.status as PrismaInspectorStatus,
        payment_settings_json: inspector.paymentSettingsJson as Prisma.InputJsonValue,
        service_types_json: inspector.serviceTypesJson,
        blocked_clients_json: inspector.blockedClientsJson,
        full_name: inspector.fullName,
        // Write Prisma.DbNull (SQL NULL) rather than a raw JSON `null` so the
        // backfill selection (address NOT in {DbNull, JsonNull}) stays correct
        // (L-F01-05). The base address is required on create, so this is normally
        // an object; the guard covers the entity's nullable type.
        address:
          inspector.address === null
            ? Prisma.DbNull
            : (inspector.address as Prisma.InputJsonValue),
        base_lat: inspector.baseLat,
        base_lng: inspector.baseLng,
        base_geocoded_at: inspector.baseGeocodedAt,
        abn: inspector.abn,
        date_of_birth: inspector.dateOfBirth,
        insurance_file_key: inspector.insuranceFileKey,
        insurance_expires_at: inspector.insuranceExpiresAt,
        police_check_file_key: inspector.policeCheckFileKey,
        police_check_expires_at: inspector.policeCheckExpiresAt,
      },
    });
  }

  // Inspectors are global entities (not tenant-scoped); scoped by unique id only
  async update(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      status: string;
      paymentSettingsJson: PaymentSettings;
      serviceTypesJson: ServiceTypeEntry[];
      blockedClientsJson: string[];
      fullName: string | null;
      address: Record<string, unknown> | null;
      baseLat: number | null;
      baseLng: number | null;
      baseGeocodedAt: Date | null;
      abn: string | null;
      dateOfBirth: Date | null;
      insuranceFileKey: string | null;
      insuranceExpiresAt: Date | null;
      policeCheckFileKey: string | null;
      policeCheckExpiresAt: Date | null;
      deletedAt: Date | null;
      photoStorageKey: string | null;
      insuranceMetaJson: Record<string, unknown> | null;
      policeCheckMetaJson: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.email !== undefined) updateData['email'] = data.email;
    if (data.phone !== undefined) updateData['phone'] = data.phone;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.paymentSettingsJson !== undefined)
      updateData['payment_settings_json'] = data.paymentSettingsJson;
    if (data.serviceTypesJson !== undefined)
      updateData['service_types_json'] = data.serviceTypesJson;
    if (data.blockedClientsJson !== undefined)
      updateData['blocked_clients_json'] = data.blockedClientsJson;
    if (data.fullName !== undefined)
      updateData['full_name'] = data.fullName;
    if (data.address !== undefined)
      updateData['address'] = data.address === null ? Prisma.DbNull : data.address;
    // F01-1: base coordinates move as a set with the address (both or neither).
    if (data.baseLat !== undefined) updateData['base_lat'] = data.baseLat;
    if (data.baseLng !== undefined) updateData['base_lng'] = data.baseLng;
    if (data.baseGeocodedAt !== undefined) updateData['base_geocoded_at'] = data.baseGeocodedAt;
    if (data.abn !== undefined)
      updateData['abn'] = data.abn;
    if (data.dateOfBirth !== undefined)
      updateData['date_of_birth'] = data.dateOfBirth;
    if (data.insuranceFileKey !== undefined)
      updateData['insurance_file_key'] = data.insuranceFileKey;
    if (data.insuranceExpiresAt !== undefined)
      updateData['insurance_expires_at'] = data.insuranceExpiresAt;
    if (data.policeCheckFileKey !== undefined)
      updateData['police_check_file_key'] = data.policeCheckFileKey;
    if (data.policeCheckExpiresAt !== undefined)
      updateData['police_check_expires_at'] = data.policeCheckExpiresAt;
    if (data.deletedAt !== undefined)
      updateData['deleted_at'] = data.deletedAt;
    if (data.photoStorageKey !== undefined)
      updateData['photo_storage_key'] = data.photoStorageKey;
    if (data.insuranceMetaJson !== undefined)
      updateData['insurance_meta_json'] = data.insuranceMetaJson;
    if (data.policeCheckMetaJson !== undefined)
      updateData['police_check_meta_json'] = data.policeCheckMetaJson;
    await this.prisma.inspector.update({ where: { id }, data: updateData });
  }

  // F01-1 heartbeat (contract 00.10). One statement so concurrent standalone
  // heartbeats resolve `app_installed_at` atomically (COALESCE on the row), and
  // a soft-deleted inspector affects 0 rows rather than resurrecting state.
  // Explicit casts: `inspectors.id` is a text column (uuid default, no @db.Uuid).
  async recordAppState(params: RecordAppStateParams): Promise<number> {
    const { id, now, displayMode, appVersion } = params;
    // push_enabled is NOT written here (F02-1 D10/L-F01-02): it now reflects active push
    // subscriptions, maintained by the inspector-notice module. Kept as a single statement.
    const affected = await this.prisma.$executeRaw`
      UPDATE "inspectors"
         SET "app_last_seen_at" = ${now}::timestamp(3),
             "app_version"      = ${appVersion}::text,
             "app_installed_at" = CASE WHEN ${displayMode}::text = 'standalone'
                                       THEN COALESCE("app_installed_at", ${now}::timestamp(3))
                                       ELSE "app_installed_at" END
       WHERE "id" = ${id}::text AND "deleted_at" IS NULL
    `;
    return affected;
  }

  async findByRegionId(regionId: string): Promise<InspectorEntity[]> {
    const rows = await this.prisma.inspector.findMany({
      where: {
        deleted_at: null,
        inspector_regions: { some: { region_id: regionId } },
      },
    });
    return rows.map(mapToEntity);
  }

  async getAvailabilityTemplate(inspectorId: string): Promise<AvailabilityTemplate> {
    const row = await this.prisma.inspector.findFirst({
      where: { id: inspectorId },
      select: { availability_template_json: true },
    });
    const parsed = availabilityTemplateSchema.safeParse(row?.availability_template_json);
    if (parsed.success) return parsed.data;
    const off = { am: false, pm: false };
    return { mon: off, tue: off, wed: off, thu: off, fri: off, sat: off, sun: off };
  }

  async updateAvailabilityTemplate(
    inspectorId: string,
    template: AvailabilityTemplate,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).inspector.update({
      where: { id: inspectorId },
      data: { availability_template_json: template as unknown as Prisma.InputJsonValue },
    });
  }

  private buildWhere(filters: InspectorFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.status) where['status'] = filters.status;
    // F01-1: "No base address" filter (AM/OP only; the use case gates the actor).
    if (filters.missingBaseAddress) where['base_lat'] = null;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.region) {
      where['inspector_regions'] = { some: { region_id: filters.region } };
    }
    if (filters.serviceTypeId) {
      where['service_types_json'] = { array_contains: [filters.serviceTypeId] };
    }
    if (filters.tenantId) {
      // Tenant-eligibility (blocked-clients deny-list) applied at the DB level so
      // pagination (skip/take) and count() agree with the actual eligible set —
      // an in-memory post-filter after LIMIT can return a short page. A legacy
      // row whose blocked-clients entries are not plain tenant-id strings simply
      // never matches `array_contains`, which is the safe (eligible) default.
      where['NOT'] = { blocked_clients_json: { array_contains: [filters.tenantId] } };
    }
    return where;
  }
}
