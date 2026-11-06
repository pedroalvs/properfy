import type { PrismaClient } from '@prisma/client';
import type {
  ILiveDayReadRepository,
  LiveDayGetDayInput,
  LiveDayInspectorRow,
  LiveDayStopRow,
  LiveDayEventRow,
  LiveDayReminderRow,
  LockedTimeRawRow,
} from '../domain/live-day.read-repository';

/**
 * Live Day read-model repository (F05-1), the two aggregated reads of Algorithm
 * §1 (`getDay`) and §7 (`getLockedTime`). Each is **one** `$queryRaw` with **zero**
 * external calls (D13), cross-tenant (D14: AM/OP only, no `tenant_id` predicate —
 * precedent `PrismaInspectorWorkloadRepository`). All derivation stays in the pure
 * domain/use-case layers; this class only shapes rows.
 *
 * `$queryRaw` hazards handled here (D-R7):
 * - every instant column is rendered as an explicit ISO-UTC string in SQL
 *   (`to_char(col, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`), because a naive
 *   `timestamp` serialized by `json_agg` has no offset and `new Date()` would read
 *   it as local time; stored instants are UTC (root CLAUDE.md §9);
 * - every coordinate/`numeric` column is cast `::float8` so it crosses as a JS
 *   `number`, never a `Prisma.Decimal` or a string;
 * - counts are `::int`;
 * - `json_agg` snake_case keys are camelised to match the flat row interfaces.
 *
 * **Geometry is never read here.** F04 Plan B (PRs #072/#073/#074) persists no
 * routing result and dropped `route_geometry`, so the SQL is identical in every
 * `includeGeometry` mode (one query — SC-003) and the straight-line route is built
 * in memory by the use case from the stop + origin coordinates this query returns.
 */

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

const GET_DAY_SQL = `
WITH plans AS (
  SELECT p.* FROM day_plans p WHERE p.plan_date = $1::date
),
appts AS (
  SELECT
    a.id AS appointment_id,
    a.appointment_number,
    a.inspector_id,
    a.status::text AS status,
    a.tenant_id,
    to_char(a.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
    a.time_slot_start,
    a.time_slot_end,
    a.key_required,
    a.rental_tenant_confirmation_status::text AS confirmation_status,
    t.name AS agency_name,
    t.timezone AS tenant_timezone,
    t.appointment_code_prefix,
    st.default_duration_minutes,
    st.flow_type::text AS flow_type,
    st.requires_rental_tenant_confirmation,
    pr.street,
    pr.suburb,
    pr.state AS property_state,
    pr.postcode,
    pr.lat::float8 AS property_lat,
    pr.lng::float8 AS property_lng,
    to_char(e.started_at, ${ISO}) AS started_at,
    to_char(e.finished_at, ${ISO}) AS finished_at,
    to_char(e.abandoned_at, ${ISO}) AS abandoned_at,
    e.start_latitude::float8 AS start_lat,
    e.start_longitude::float8 AS start_lng,
    e.finish_latitude::float8 AS finish_lat,
    e.finish_longitude::float8 AS finish_lng,
    e.out_of_radius,
    e.finish_out_of_radius,
    e.out_of_window,
    e.geofence_radius_m,
    e.geolocation_distance_meters::float8 AS geolocation_distance_meters,
    e.finish_geolocation_distance_meters::float8 AS finish_geolocation_distance_meters,
    pl.id AS plan_id,
    s.sequence,
    s.travel_s,
    s.duration_minutes AS stop_duration_minutes,
    to_char(s.service_start_at, ${ISO}) AS service_start_at,
    to_char(s.service_end_at, ${ISO}) AS service_end_at,
    to_char(s.published_service_start_at, ${ISO}) AS published_service_start_at,
    to_char(s.window_start_at, ${ISO}) AS window_start_at,
    to_char(s.window_end_at, ${ISO}) AS window_end_at,
    s.window_timezone,
    s.missing_coordinates,
    s.late_s
  FROM appointments a
  JOIN tenants t ON t.id = a.tenant_id
  JOIN service_types st ON st.id = a.service_type_id
  JOIN properties pr ON pr.id = a.property_id
  LEFT JOIN inspection_executions e ON e.appointment_id = a.id
  LEFT JOIN plans pl ON pl.inspector_id = a.inspector_id
  LEFT JOIN day_plan_stops s ON s.day_plan_id = pl.id AND s.appointment_id = a.id
  WHERE a.scheduled_date = $1::date
    AND a.inspector_id IS NOT NULL
    AND a.deleted_at IS NULL
    AND a.status IN ('SCHEDULED', 'DONE')
),
planned AS (
  SELECT s.day_plan_id, count(*)::int AS planned_count
  FROM day_plan_stops s
  WHERE s.day_plan_id IN (SELECT id FROM plans)
  GROUP BY s.day_plan_id
),
events AS (
  SELECT
    fe.id,
    fe.inspector_id,
    fe.type::text AS type,
    fe.appointment_id,
    fe.reason_code,
    fe.note,
    fe.minutes,
    to_char(fe.created_at, ${ISO}) AS created_at,
    to_char(fe.client_occurred_at, ${ISO}) AS client_occurred_at,
    a2.time_slot_start AS appt_time_slot_start,
    to_char(a2.scheduled_date, 'YYYY-MM-DD') AS appt_scheduled_date,
    t2.timezone AS appt_tenant_timezone,
    a2.appointment_number,
    a2.tenant_id,
    t2.appointment_code_prefix,
    a2.status::text AS appt_status,
    a2.inspector_id AS appt_inspector_id,
    (a2.status = 'REJECTED' AND a2.inspector_id IS NULL AND a2.deleted_at IS NULL) AS cant_do_active
  FROM inspector_field_events fe
  JOIN appointments a2 ON a2.id = fe.appointment_id
  JOIN tenants t2 ON t2.id = a2.tenant_id
  WHERE fe.created_at >= ($1::date - interval '1 day')
    AND fe.created_at < ($1::date + interval '2 days')
    AND a2.scheduled_date = $1::date
),
reminders AS (
  SELECT n.dedupe_key, to_char(n.created_at, ${ISO}) AS created_at
  FROM inspector_notices n
  WHERE n.dedupe_key = ANY (
    SELECT $2::text || ':' || id || ':' || $1::text || ':' || inspector_id FROM appts
  )
),
roster AS (
  SELECT inspector_id FROM appts
  UNION
  SELECT inspector_id FROM events WHERE type = 'CANT_DO' AND cant_do_active
)
SELECT
  i.id AS inspector_id,
  i.name AS inspector_name,
  i.base_lat::float8 AS base_lat,
  i.base_lng::float8 AS base_lng,
  i.alert_overrides_json,
  pl.id AS plan_id,
  pl.status::text AS plan_status,
  pl.version AS plan_version,
  pl.timezone AS plan_timezone,
  pl.input_fingerprint,
  to_char(pl.departure_at, ${ISO}) AS departure_at,
  pl.origin_source::text AS origin_source,
  pl.origin_lat::float8 AS origin_lat,
  pl.origin_lng::float8 AS origin_lng,
  pl.origin_override_lat::float8 AS origin_override_lat,
  pl.origin_override_lng::float8 AS origin_override_lng,
  pl.approximate,
  pl.feasible,
  coalesce(pc.planned_count, 0)::int AS planned_count,
  coalesce(
    (SELECT json_agg(x ORDER BY x.sequence NULLS LAST, x.time_slot_start)
     FROM appts x WHERE x.inspector_id = i.id),
    '[]'::json
  ) AS stops,
  coalesce(
    (SELECT json_agg(ev) FROM events ev WHERE ev.inspector_id = i.id),
    '[]'::json
  ) AS events,
  coalesce(
    (SELECT json_agg(r) FROM reminders r
     WHERE r.dedupe_key IN (
       SELECT $2::text || ':' || x.id || ':' || $1::text || ':' || i.id
       FROM appts x WHERE x.inspector_id = i.id
     )),
    '[]'::json
  ) AS reminders
FROM roster ro
JOIN inspectors i ON i.id = ro.inspector_id
LEFT JOIN plans pl ON pl.inspector_id = i.id
LEFT JOIN planned pc ON pc.day_plan_id = pl.id
ORDER BY i.name;
`;

/** Raw top-level row shape as it crosses from `$queryRaw` (snake_case, JS-typed). */
interface RawInspectorRow {
  inspector_id: string;
  inspector_name: string;
  base_lat: number | null;
  base_lng: number | null;
  alert_overrides_json: unknown;
  plan_id: string | null;
  plan_status: string | null;
  plan_version: number | null;
  plan_timezone: string | null;
  input_fingerprint: string | null;
  departure_at: string | null;
  origin_source: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_override_lat: number | null;
  origin_override_lng: number | null;
  approximate: boolean | null;
  feasible: boolean | null;
  planned_count: number;
  stops: unknown;
  events: unknown;
  reminders: unknown;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, c: string) => c.toUpperCase());
}

/** Camelise the keys of one flat `json_agg` object (values already JS-typed). */
function camelizeFlat<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[snakeToCamel(k)] = v;
  return out as T;
}

/** Prisma returns `json` columns parsed; guard the rare string case defensively. */
function asRows(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

export class PrismaLiveDayReadRepository implements ILiveDayReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDay(input: LiveDayGetDayInput): Promise<LiveDayInspectorRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawInspectorRow[]>(
      GET_DAY_SQL,
      input.date,
      input.completionReminderPrefix,
    );

    return rows.map((r) => ({
      inspectorId: r.inspector_id,
      inspectorName: r.inspector_name,
      baseLat: r.base_lat,
      baseLng: r.base_lng,
      alertOverridesJson: r.alert_overrides_json ?? null,
      planId: r.plan_id,
      planStatus: r.plan_status as LiveDayInspectorRow['planStatus'],
      planVersion: r.plan_version,
      planTimezone: r.plan_timezone,
      inputFingerprint: r.input_fingerprint,
      departureAt: r.departure_at,
      originSource: r.origin_source,
      originLat: r.origin_lat,
      originLng: r.origin_lng,
      originOverrideLat: r.origin_override_lat,
      originOverrideLng: r.origin_override_lng,
      approximate: r.approximate,
      feasible: r.feasible,
      plannedCount: r.planned_count,
      stops: asRows(r.stops).map((s) => camelizeFlat<LiveDayStopRow>(s)),
      events: asRows(r.events).map((e) => camelizeFlat<LiveDayEventRow>(e)),
      reminders: asRows(r.reminders).map((rm) => camelizeFlat<LiveDayReminderRow>(rm)),
    }));
  }

  async getLockedTime(from: string, to: string): Promise<LockedTimeRawRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawLockedTimeRow[]>(GET_LOCKED_TIME_SQL, from, to);
    return rows.map((r) => ({
      dim: r.dim as LockedTimeRawRow['dim'],
      key: r.key,
      label: r.label ?? '',
      regionAgencyName: r.region_agency_name,
      confirmed: r.confirmed,
      required: r.required,
    }));
  }
}

/**
 * Locked-time confirmation rate (Algorithm §7, D21), one SQL statement. `E` = routine
 * appointments that require rental-tenant confirmation and are not key-access, in the
 * civil-date range. The denominator keeps the T-1-eligible statuses plus the
 * tenant-driven rejections (`TENANT_NO_RESPONSE`/`TENANT_DECLINED`, counted as NOT
 * locked); the numerator is the confirmed, non-rejected subset. Region is the group's
 * region first, else the lowest-`region_number` `ACTIVE` region that intersects the
 * property (PostGIS). Cross-tenant (D14): AM/OP only, no `tenant_id` predicate.
 */
const GET_LOCKED_TIME_SQL = `
WITH base AS (
  SELECT a.id, a.tenant_id, t.name AS agency_name, a.property_id, a.service_group_id,
         (a.status <> 'REJECTED' AND a.rental_tenant_confirmation_status = 'CONFIRMED') AS confirmed
  FROM appointments a
  JOIN service_types st ON st.id = a.service_type_id
  JOIN tenants t ON t.id = a.tenant_id
  WHERE a.scheduled_date BETWEEN $1::date AND $2::date
    AND a.deleted_at IS NULL
    AND (
      a.status IN ('AWAITING_INSPECTOR', 'SCHEDULED', 'DONE')
      OR (a.status = 'REJECTED' AND a.rejection_reason_code IN ('TENANT_NO_RESPONSE', 'TENANT_DECLINED'))
    )
    AND st.flow_type = 'ROUTINE'
    AND st.requires_rental_tenant_confirmation = true
    AND a.key_required = false
),
regioned AS (
  SELECT b.*,
         coalesce(gr.id, geo.id) AS region_id,
         coalesce(gr.name, geo.name) AS region_name,
         rt.name AS region_agency_name
  FROM base b
  LEFT JOIN service_groups sg ON sg.id = b.service_group_id
  LEFT JOIN service_regions gr ON gr.id = sg.service_region_id
  LEFT JOIN LATERAL (
    SELECT sr.id, sr.name, sr.tenant_id
    FROM service_regions sr
    JOIN properties p ON p.id = b.property_id
    WHERE gr.id IS NULL
      AND sr.status = 'ACTIVE'
      AND sr.geom IS NOT NULL
      AND p.coordinates IS NOT NULL
      AND p.deleted_at IS NULL
      AND (sr.tenant_id = b.tenant_id OR sr.tenant_id IS NULL)
      AND ST_Intersects(sr.geom, p.coordinates)
    ORDER BY sr.region_number ASC
    LIMIT 1
  ) geo ON true
  LEFT JOIN tenants rt ON rt.id = coalesce(gr.tenant_id, geo.tenant_id)
)
SELECT 'AGENCY' AS dim, tenant_id::text AS key, agency_name AS label, NULL::text AS region_agency_name,
       count(*) FILTER (WHERE confirmed)::int AS confirmed, count(*)::int AS required
FROM regioned
GROUP BY tenant_id, agency_name
UNION ALL
SELECT 'REGION', region_id::text, region_name, region_agency_name,
       count(*) FILTER (WHERE confirmed)::int, count(*)::int
FROM regioned
GROUP BY region_id, region_name, region_agency_name;
`;

interface RawLockedTimeRow {
  dim: string;
  key: string | null;
  label: string | null;
  region_agency_name: string | null;
  confirmed: number;
  required: number;
}
