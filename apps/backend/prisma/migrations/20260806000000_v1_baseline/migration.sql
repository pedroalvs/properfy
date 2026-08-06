-- v1 baseline — squash of the 124 pre-v1.0.0 migrations (2026-08).
-- Source of truth: pg_dump --schema-only of a database built by replaying the
-- full old migration history into a clean PostGIS container. pg_dump (not
-- prisma migrate diff) because the differ is lossy: it drops standalone
-- sequences (e.g. inspector_invoice_number_seq), trigger functions
-- (normalize_property_address) and partial-index predicates.
-- Appended below the schema: the reference rows that survive a clean replay
-- (audit retention configs, PII field mappings, platform notification
-- templates) — platform config every environment needs, production included.
-- COMMENT ON EXTENSION lines are stripped (Supabase's postgres role does not
-- own extensions).
-- Verified: pg_dump of old-history DB vs baseline DB is textually identical
-- (schema and data). Pre-existing environments were baselined with
-- `prisma migrate resolve`.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.4


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: AppointmentContactRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AppointmentContactRole" AS ENUM (
    'RENTAL_TENANT',
    'RENTAL_TENANT_REPRESENTATIVE',
    'HOUSEKEEPER',
    'PROPERTY_MANAGER',
    'BROKER',
    'OTHER'
);


--
-- Name: AppointmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AppointmentStatus" AS ENUM (
    'DRAFT',
    'AWAITING_INSPECTOR',
    'SCHEDULED',
    'DONE',
    'CANCELLED',
    'REJECTED'
);


--
-- Name: AuditActorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditActorType" AS ENUM (
    'USER',
    'SYSTEM',
    'ANONYMOUS'
);


--
-- Name: AuditRedactionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditRedactionStatus" AS ENUM (
    'NONE',
    'PARTIAL',
    'FULL',
    'IN_PROGRESS'
);


--
-- Name: AuditRetentionCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditRetentionCategory" AS ENUM (
    'FINANCIAL',
    'OPERATIONAL_CRITICAL',
    'OPERATIONAL_GENERAL'
);


--
-- Name: AvailabilitySlotStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AvailabilitySlotStatus" AS ENUM (
    'AVAILABLE',
    'BOOKED',
    'CANCELLED'
);


--
-- Name: BillingPeriodType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingPeriodType" AS ENUM (
    'WEEKLY',
    'FORTNIGHTLY',
    'MONTHLY'
);


--
-- Name: BranchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BranchStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: ConsentChangeSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ConsentChangeSource" AS ENUM (
    'operator_override',
    're_opt_in'
);


--
-- Name: ContactChannelType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContactChannelType" AS ENUM (
    'EMAIL',
    'PHONE'
);


--
-- Name: ContactType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContactType" AS ENUM (
    'RENTAL_TENANT',
    'PROPERTY_MANAGER',
    'HOUSEKEEPER',
    'BROKER',
    'OTHER'
);


--
-- Name: CycleConfirmationSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CycleConfirmationSource" AS ENUM (
    'RENTAL_TENANT_PORTAL',
    'OPERATOR_FORCED',
    'RENTAL_TENANT_RESCHEDULE'
);


--
-- Name: CycleInvalidatedReason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CycleInvalidatedReason" AS ENUM (
    'DATE_CHANGED',
    'TIME_CHANGED',
    'APPOINTMENT_REOPENED',
    'RENTAL_TENANT_RESCHEDULE'
);


--
-- Name: CycleStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CycleStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'UNAVAILABLE',
    'SUPERSEDED'
);


--
-- Name: ErasureRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ErasureRequestStatus" AS ENUM (
    'PENDING',
    'SCANNING',
    'PREVIEW',
    'CONFIRMED',
    'EXECUTING',
    'COMPLETED',
    'FAILED'
);


--
-- Name: FinancialEntryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FinancialEntryStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'CANCELLED',
    'VOIDED'
);


--
-- Name: FinancialEntryType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FinancialEntryType" AS ENUM (
    'TENANT_DEBIT',
    'INSPECTOR_PAYOUT',
    'REFUND',
    'MANUAL_ADJUSTMENT'
);


--
-- Name: GeocodingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GeocodingStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'MANUAL'
);


--
-- Name: InspectorInvoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InspectorInvoiceStatus" AS ENUM (
    'PENDING_REVIEW',
    'CLOSED',
    'PAID',
    'VOID'
);


--
-- Name: InspectorStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InspectorStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: NotificationAttemptStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationAttemptStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'EMAIL',
    'SMS'
);


--
-- Name: NotificationClass; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationClass" AS ENUM (
    'TRANSACTIONAL',
    'OPERATIONAL',
    'MARKETING'
);


--
-- Name: NotificationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationStatus" AS ENUM (
    'PENDING',
    'SENT',
    'DELIVERED',
    'FAILED',
    'SKIPPED',
    'SKIPPED_OPT_OUT'
);


--
-- Name: PayoutType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayoutType" AS ENUM (
    'FIXED',
    'PERCENTAGE'
);


--
-- Name: PreservationRuleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PreservationRuleType" AS ENUM (
    'CROSS_CHECK',
    'LEGAL_HOLD'
);


--
-- Name: PriceRuleStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PriceRuleStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: PropertyType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PropertyType" AS ENUM (
    'APARTMENT',
    'HOUSE'
);


--
-- Name: RegionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RegionStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: RentalTenantConfirmationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RentalTenantConfirmationStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'UNAVAILABLE',
    'NO_RESPONSE'
);


--
-- Name: RentalTenantPortalAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RentalTenantPortalAction" AS ENUM (
    'VIEW',
    'CONFIRM',
    'RESCHEDULE',
    'CONTACT_UPDATED',
    'UNAVAILABLE_REPORTED',
    'GROUP_JOIN',
    'SURVEY_SUBMITTED'
);


--
-- Name: RentalTenantPortalTokenStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RentalTenantPortalTokenStatus" AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'REVOKED',
    'SUPERSEDED'
);


--
-- Name: ReportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReportStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'READY',
    'FAILED'
);


--
-- Name: ReportType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReportType" AS ENUM (
    'APPOINTMENTS',
    'FINANCIAL',
    'PERFORMANCE',
    'AGENCIES'
);


--
-- Name: RestrictionSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RestrictionSource" AS ENUM (
    'RENTAL_TENANT_PORTAL',
    'OPERATOR',
    'IMPORT'
);


--
-- Name: ServiceGroupStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ServiceGroupStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ACCEPTED',
    'CANCELLED',
    'REJECTED'
);


--
-- Name: ServiceTypeFlowType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ServiceTypeFlowType" AS ENUM (
    'ROUTINE',
    'INGOING',
    'OUTGOING'
);


--
-- Name: ServiceTypeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ServiceTypeStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: TenantStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenantStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'AM',
    'OP',
    'CL_ADMIN',
    'CL_USER',
    'INSP'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'LOCKED',
    'PENDING_INVITE'
);


--
-- Name: normalize_property_address(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_property_address() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.normalized_address_key :=
    lower(regexp_replace(btrim(NEW.street), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(coalesce(NEW.address_line_2, '')), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.suburb), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.state), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.postcode), '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;




--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id text NOT NULL,
    name character varying(200) NOT NULL,
    key_hash character varying(64) NOT NULL,
    prefix character varying(20) NOT NULL,
    role character varying(10) NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[],
    expires_at timestamp(3) without time zone,
    revoked_at timestamp(3) without time zone,
    last_used_at timestamp(3) without time zone,
    created_by_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: app_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_credentials (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name character varying(200) NOT NULL,
    username character varying(200) NOT NULL,
    password_encrypted text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    app_url character varying(1000),
    branch_id text,
    instructions_password_encrypted text,
    instructions_url character varying(1000),
    needs_auth_code boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: appointment_app_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_app_credentials (
    id text NOT NULL,
    appointment_id text NOT NULL,
    app_credential_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: appointment_confirmation_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_confirmation_cycles (
    id text NOT NULL,
    appointment_id text NOT NULL,
    cycle_number integer NOT NULL,
    scheduled_date date NOT NULL,
    time_slot text,
    status public."CycleStatus" DEFAULT 'PENDING'::public."CycleStatus" NOT NULL,
    confirmation_source public."CycleConfirmationSource",
    confirmed_at timestamp(3) without time zone,
    invalidated_at timestamp(3) without time zone,
    invalidated_reason public."CycleInvalidatedReason",
    portal_token_id text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


--
-- Name: appointment_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_contacts (
    id text NOT NULL,
    appointment_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    contact_id text,
    role public."AppointmentContactRole" DEFAULT 'RENTAL_TENANT'::public."AppointmentContactRole" NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    snapshot_name character varying(200) NOT NULL,
    snapshot_email character varying(254),
    snapshot_phone character varying(30)
);


--
-- Name: appointment_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_imports (
    id text NOT NULL,
    tenant_id text NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    file_key character varying(500) NOT NULL,
    original_filename character varying(255) NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    errors_json jsonb,
    created_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    branch_id text,
    preview_json jsonb,
    results_json jsonb
);


--
-- Name: appointment_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_restrictions (
    id text NOT NULL,
    appointment_id text NOT NULL,
    is_home boolean NOT NULL,
    unavailable_days_json jsonb,
    unavailable_hours_json jsonb,
    notes text,
    source public."RestrictionSource" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    available_slots_json jsonb
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    property_id text NOT NULL,
    service_type_id text NOT NULL,
    inspector_id text,
    status public."AppointmentStatus" DEFAULT 'DRAFT'::public."AppointmentStatus" NOT NULL,
    scheduled_date date NOT NULL,
    key_required boolean DEFAULT false NOT NULL,
    meeting_location character varying(500),
    key_location character varying(500),
    rental_tenant_confirmation_status public."RentalTenantConfirmationStatus" DEFAULT 'PENDING'::public."RentalTenantConfirmationStatus" NOT NULL,
    price_amount numeric(12,2) NOT NULL,
    payout_amount numeric(12,2) NOT NULL,
    pricing_rule_snapshot_json jsonb NOT NULL,
    notes text,
    custom_fields_json jsonb,
    reason text,
    created_by_user_id text NOT NULL,
    done_checked_by_user_id text,
    done_checked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    service_group_id text,
    cancellation_reason_code character varying(50),
    rejection_reason_code character varying(50),
    appointment_number integer NOT NULL,
    done_marked_by_user_id text,
    rental_tenant_note text,
    active_confirmation_cycle_id text,
    observation text,
    time_slot_start character varying(5) NOT NULL,
    time_slot_end character varying(5) NOT NULL
);


--
-- Name: appointments_appointment_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointments_appointment_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointments_appointment_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointments_appointment_number_seq OWNED BY public.appointments.appointment_number;


--
-- Name: audit_legal_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_legal_holds (
    id text NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id text NOT NULL,
    tenant_id text,
    reason text NOT NULL,
    placed_by_user_id text NOT NULL,
    placed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_by_user_id text,
    released_at timestamp(3) without time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    tenant_id text,
    actor_type public."AuditActorType" NOT NULL,
    actor_id text,
    entity_type character varying(100) NOT NULL,
    entity_id text,
    action character varying(200) NOT NULL,
    reason text,
    before_json jsonb,
    after_json jsonb,
    request_id character varying(100),
    ip_address character varying(45),
    metadata_json jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    retention_category public."AuditRetentionCategory",
    redaction_status public."AuditRedactionStatus" DEFAULT 'NONE'::public."AuditRedactionStatus" NOT NULL,
    cold_storage boolean DEFAULT false NOT NULL,
    preservation_rule_id text
);


--
-- Name: audit_logs_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_archive (
    id text NOT NULL,
    tenant_id text,
    actor_type public."AuditActorType" NOT NULL,
    actor_id text,
    entity_type character varying(100) NOT NULL,
    entity_id text,
    action character varying(200) NOT NULL,
    reason text,
    before_json jsonb,
    after_json jsonb,
    request_id character varying(100),
    ip_address character varying(45),
    metadata_json jsonb,
    created_at timestamp(3) without time zone NOT NULL,
    retention_category public."AuditRetentionCategory",
    redaction_status public."AuditRedactionStatus" DEFAULT 'NONE'::public."AuditRedactionStatus" NOT NULL,
    cold_storage boolean DEFAULT true NOT NULL,
    preservation_rule_id text,
    archived_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_preservation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_preservation_rules (
    id text NOT NULL,
    name character varying(200) NOT NULL,
    rule_type public."PreservationRuleType" NOT NULL,
    entity_type character varying(100),
    entity_id text,
    tenant_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: audit_retention_category_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_retention_category_configs (
    id text NOT NULL,
    name public."AuditRetentionCategory" NOT NULL,
    retention_years integer NOT NULL,
    hard_delete_enabled boolean DEFAULT false NOT NULL,
    description text,
    action_patterns_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name character varying(200) NOT NULL,
    address_json jsonb,
    status public."BranchStatus" DEFAULT 'ACTIVE'::public."BranchStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    contact_email character varying(254)
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id text NOT NULL,
    tenant_id text,
    type public."ContactType" NOT NULL,
    display_name character varying(200) NOT NULL,
    company character varying(200),
    primary_email character varying(254),
    primary_phone character varying(30),
    additional_channels_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT contacts_at_least_one_channel CHECK (((primary_email IS NOT NULL) OR (primary_phone IS NOT NULL)))
);


--
-- Name: cron_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_job_runs (
    job_name character varying(100) NOT NULL,
    tenant_id text NOT NULL,
    local_date date NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: data_subject_erasure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_subject_erasure_requests (
    id text NOT NULL,
    subject_identifier_type character varying(20) NOT NULL,
    subject_identifier_value character varying(500) NOT NULL,
    resolved_pii_values_json jsonb,
    status public."ErasureRequestStatus" DEFAULT 'PENDING'::public."ErasureRequestStatus" NOT NULL,
    entries_found_count integer,
    entries_redacted_count integer,
    entries_flagged_for_review_count integer,
    completion_report_json jsonb,
    initiated_by_user_id text NOT NULL,
    initiated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp(3) without time zone
);


--
-- Name: financial_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_entries (
    id text NOT NULL,
    tenant_id text NOT NULL,
    appointment_id text,
    inspector_id text,
    entry_type public."FinancialEntryType" NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character(3) NOT NULL,
    status public."FinancialEntryStatus" DEFAULT 'PENDING'::public."FinancialEntryStatus" NOT NULL,
    description character varying(500) NOT NULL,
    effective_at timestamp(3) without time zone NOT NULL,
    initiated_by_user_id text NOT NULL,
    approved_by_user_id text,
    approved_at timestamp(3) without time zone,
    reference_entry_id text,
    reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    voided_by_user_id text,
    voided_at timestamp(3) without time zone,
    void_reason text
);


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    id text NOT NULL,
    key text NOT NULL,
    scope text NOT NULL,
    response jsonb NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payload_hash character varying(64)
);


--
-- Name: inspection_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspection_executions (
    id text NOT NULL,
    appointment_id text NOT NULL,
    inspector_id text NOT NULL,
    started_at timestamp(3) without time zone NOT NULL,
    finished_at timestamp(3) without time zone,
    start_latitude numeric(10,7) NOT NULL,
    start_longitude numeric(10,7) NOT NULL,
    finish_latitude numeric(10,7),
    finish_longitude numeric(10,7),
    checklist_json jsonb,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    geolocation_distance_meters numeric(10,2),
    resumed_at timestamp(3) without time zone
);


--
-- Name: inspector_availability_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspector_availability_slots (
    id text NOT NULL,
    inspector_id text NOT NULL,
    date date NOT NULL,
    start_time character varying(5) NOT NULL,
    end_time character varying(5) NOT NULL,
    region_json jsonb,
    capacity integer DEFAULT 1 NOT NULL,
    status public."AvailabilitySlotStatus" DEFAULT 'AVAILABLE'::public."AvailabilitySlotStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    is_operator_override boolean DEFAULT false NOT NULL
);


--
-- Name: inspector_invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inspector_invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspector_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspector_invoices (
    id text NOT NULL,
    inspector_id text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_type public."BillingPeriodType" NOT NULL,
    status public."InspectorInvoiceStatus" NOT NULL,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency character(3) NOT NULL,
    file_key text,
    generated_by_user_id text,
    issued_at timestamp(3) without time zone,
    paid_at timestamp(3) without time zone,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    paid_by_user_id text,
    payment_reference character varying(255),
    drafted_by_inspector_id text,
    invoice_number integer,
    inspector_name text,
    line_items_snapshot jsonb,
    inspector_abn character varying(20)
);


--
-- Name: inspector_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspector_regions (
    inspector_id text NOT NULL,
    region_id text NOT NULL,
    assigned_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    assigned_by text
);


--
-- Name: inspectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspectors (
    id text NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(254) NOT NULL,
    phone character varying(20),
    status public."InspectorStatus" DEFAULT 'ACTIVE'::public."InspectorStatus" NOT NULL,
    payment_settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    service_types_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    user_id text,
    full_name character varying(300),
    address jsonb,
    abn character varying(20),
    date_of_birth date,
    insurance_file_key text,
    insurance_expires_at date,
    police_check_file_key text,
    police_check_expires_at date,
    blocked_clients_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    photo_storage_key text,
    insurance_meta_json jsonb,
    police_check_meta_json jsonb,
    availability_template_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    billing_cycle public."BillingPeriodType"
);


--
-- Name: integration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_settings (
    id text NOT NULL,
    provider character varying(50) NOT NULL,
    encrypted_config text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_by_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: notification_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_attempts (
    id text NOT NULL,
    notification_id text NOT NULL,
    attempt_number integer NOT NULL,
    status public."NotificationAttemptStatus" DEFAULT 'PENDING'::public."NotificationAttemptStatus" NOT NULL,
    provider_error text,
    started_at timestamp(3) without time zone NOT NULL,
    finished_at timestamp(3) without time zone
);


--
-- Name: notification_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_consents (
    id text NOT NULL,
    recipient character varying(320) NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    tenant_id text NOT NULL,
    opted_out boolean DEFAULT false NOT NULL,
    opted_out_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    notification_class public."NotificationClass" DEFAULT 'OPERATIONAL'::public."NotificationClass" NOT NULL,
    change_source public."ConsentChangeSource",
    changed_at timestamp(3) without time zone,
    changed_by_user_id text,
    reason text
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id text NOT NULL,
    tenant_id text,
    template_code character varying(100) NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    subject character varying(255),
    body_html text,
    body_text text NOT NULL,
    variables_json jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    notification_class public."NotificationClass" DEFAULT 'OPERATIONAL'::public."NotificationClass" NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    tenant_id text,
    appointment_id text,
    recipient character varying(320) NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    template_code character varying(100) NOT NULL,
    status public."NotificationStatus" DEFAULT 'PENDING'::public."NotificationStatus" NOT NULL,
    provider_name character varying(50),
    provider_message_id character varying(200),
    sent_at timestamp(3) without time zone,
    delivered_at timestamp(3) without time zone,
    failed_at timestamp(3) without time zone,
    failure_reason text,
    payload_json jsonb NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    notification_class public."NotificationClass"
);


--
-- Name: password_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_history (
    id text NOT NULL,
    user_id text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pii_field_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pii_field_mappings (
    id text NOT NULL,
    action_pattern character varying(200) NOT NULL,
    json_field_path character varying(500) NOT NULL,
    classification character varying(50) NOT NULL,
    requires_manual_review boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text,
    property_code character varying(50) NOT NULL,
    type public."PropertyType" NOT NULL,
    street character varying(300) NOT NULL,
    address_line_2 character varying(200),
    suburb character varying(100) NOT NULL,
    postcode character varying(20) NOT NULL,
    state character varying(100) NOT NULL,
    country character varying(100) DEFAULT 'AU'::character varying NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    geocoding_status public."GeocodingStatus" DEFAULT 'PENDING'::public."GeocodingStatus" NOT NULL,
    notes text,
    rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    coordinates public.geometry(Point,4326),
    normalized_address_key character varying(750) DEFAULT ''::character varying NOT NULL,
    private_area_m2 numeric(10,2),
    total_area_m2 numeric(10,2),
    furnished boolean,
    linen_provided boolean,
    rent_amount numeric(12,2),
    apartment_number character varying(50),
    property_number integer
);


--
-- Name: rental_tenant_portal_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_tenant_portal_activities (
    id text NOT NULL,
    appointment_id text NOT NULL,
    rental_tenant_portal_token_id text NOT NULL,
    action public."RentalTenantPortalAction" NOT NULL,
    previous_values_json jsonb,
    new_values_json jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    retention_category public."AuditRetentionCategory",
    redaction_status public."AuditRedactionStatus" DEFAULT 'NONE'::public."AuditRedactionStatus" NOT NULL,
    cold_storage boolean DEFAULT false NOT NULL
);


--
-- Name: rental_tenant_portal_activities_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_tenant_portal_activities_archive (
    id text NOT NULL,
    appointment_id text NOT NULL,
    rental_tenant_portal_token_id text NOT NULL,
    action public."RentalTenantPortalAction" NOT NULL,
    previous_values_json jsonb,
    new_values_json jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp(3) without time zone NOT NULL,
    retention_category public."AuditRetentionCategory",
    redaction_status public."AuditRedactionStatus" DEFAULT 'NONE'::public."AuditRedactionStatus" NOT NULL,
    cold_storage boolean DEFAULT true NOT NULL,
    archived_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: rental_tenant_portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_tenant_portal_tokens (
    id text NOT NULL,
    appointment_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    status public."RentalTenantPortalTokenStatus" DEFAULT 'ACTIVE'::public."RentalTenantPortalTokenStatus" NOT NULL,
    last_accessed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    raw_token_encrypted text,
    confirmation_cycle_id text,
    confirm_cutoff_at timestamp(3) without time zone
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id text NOT NULL,
    tenant_id text,
    report_type public."ReportType" NOT NULL,
    filters_json jsonb NOT NULL,
    status public."ReportStatus" DEFAULT 'PENDING'::public."ReportStatus" NOT NULL,
    file_key text,
    requested_by_user_id text NOT NULL,
    started_at timestamp(3) without time zone,
    completed_at timestamp(3) without time zone,
    failed_at timestamp(3) without time zone,
    error_message text,
    row_count integer,
    expires_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    agency_scoped boolean DEFAULT false NOT NULL
);


--
-- Name: satisfaction_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.satisfaction_surveys (
    id text NOT NULL,
    appointment_id text NOT NULL,
    tenant_id text NOT NULL,
    inspector_id text NOT NULL,
    rating integer NOT NULL,
    comment text,
    submitted_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT satisfaction_surveys_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: service_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_groups (
    id text NOT NULL,
    service_type_id text NOT NULL,
    status public."ServiceGroupStatus" DEFAULT 'DRAFT'::public."ServiceGroupStatus" NOT NULL,
    offered_count integer DEFAULT 0 NOT NULL,
    confirmed_count integer DEFAULT 0 NOT NULL,
    scheduled_date date NOT NULL,
    time_window character varying(11) NOT NULL,
    assigned_inspector_id text,
    published_at timestamp(3) without time zone,
    assigned_at timestamp(3) without time zone,
    created_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    region_name character varying(255),
    description text,
    service_region_id text,
    group_number integer NOT NULL
);


--
-- Name: service_groups_group_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_groups_group_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_groups_group_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_groups_group_number_seq OWNED BY public.service_groups.group_number;


--
-- Name: service_price_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_price_rules (
    id text NOT NULL,
    tenant_id text NOT NULL,
    service_type_id text NOT NULL,
    branch_id text,
    price_amount numeric(12,2) NOT NULL,
    payout_type public."PayoutType" NOT NULL,
    payout_value numeric(12,2) NOT NULL,
    bonus_rule_json jsonb,
    status public."PriceRuleStatus" DEFAULT 'ACTIVE'::public."PriceRuleStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    currency character varying(3) NOT NULL
);


--
-- Name: service_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_regions (
    id text NOT NULL,
    name character varying(255) NOT NULL,
    status public."RegionStatus" DEFAULT 'ACTIVE'::public."RegionStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    geom public.geometry(Geometry,4326),
    geojson jsonb DEFAULT '{}'::jsonb NOT NULL,
    color character varying(20) DEFAULT '#3b82f6'::character varying NOT NULL,
    created_by_user_id text,
    tenant_id text,
    region_number integer NOT NULL
);


--
-- Name: service_regions_region_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_regions_region_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_regions_region_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_regions_region_number_seq OWNED BY public.service_regions.region_number;


--
-- Name: service_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_types (
    id text NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    flow_type public."ServiceTypeFlowType" NOT NULL,
    requires_rental_tenant_confirmation boolean DEFAULT true NOT NULL,
    status public."ServiceTypeStatus" DEFAULT 'ACTIVE'::public."ServiceTypeStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    refresh_token_hash text NOT NULL,
    ip_address character varying(45),
    user_agent character varying(500),
    expires_at timestamp(3) without time zone NOT NULL,
    revoked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    country_code character varying(2),
    device_fingerprint character varying(64)
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name character varying(200) NOT NULL,
    legal_name character varying(200) NOT NULL,
    status public."TenantStatus" DEFAULT 'PENDING'::public."TenantStatus" NOT NULL,
    timezone character varying(60) DEFAULT 'Australia/Sydney'::character varying NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    appointment_code_prefix character varying(4),
    CONSTRAINT tenants_appointment_code_prefix_format CHECK (((appointment_code_prefix)::text ~ '^[A-Z0-9]{3,4}$'::text))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    tenant_id text,
    branch_id text,
    role public."UserRole" NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(254) NOT NULL,
    phone character varying(20),
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    password_hash text NOT NULL,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp(3) without time zone,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    timezone character varying(60)
);


--
-- Name: appointments appointment_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ALTER COLUMN appointment_number SET DEFAULT nextval('public.appointments_appointment_number_seq'::regclass);


--
-- Name: service_groups group_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups ALTER COLUMN group_number SET DEFAULT nextval('public.service_groups_group_number_seq'::regclass);


--
-- Name: service_regions region_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_regions ALTER COLUMN region_number SET DEFAULT nextval('public.service_regions_region_number_seq'::regclass);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: app_credentials app_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_credentials
    ADD CONSTRAINT app_credentials_pkey PRIMARY KEY (id);


--
-- Name: appointment_app_credentials appointment_app_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_app_credentials
    ADD CONSTRAINT appointment_app_credentials_pkey PRIMARY KEY (id);


--
-- Name: appointment_confirmation_cycles appointment_confirmation_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_confirmation_cycles
    ADD CONSTRAINT appointment_confirmation_cycles_pkey PRIMARY KEY (id);


--
-- Name: appointment_contacts appointment_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_contacts
    ADD CONSTRAINT appointment_contacts_pkey PRIMARY KEY (id);


--
-- Name: appointment_imports appointment_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_imports
    ADD CONSTRAINT appointment_imports_pkey PRIMARY KEY (id);


--
-- Name: appointment_restrictions appointment_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_restrictions
    ADD CONSTRAINT appointment_restrictions_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_legal_holds audit_legal_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_legal_holds
    ADD CONSTRAINT audit_legal_holds_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_archive audit_logs_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_archive
    ADD CONSTRAINT audit_logs_archive_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_preservation_rules audit_preservation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_preservation_rules
    ADD CONSTRAINT audit_preservation_rules_pkey PRIMARY KEY (id);


--
-- Name: audit_retention_category_configs audit_retention_category_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_retention_category_configs
    ADD CONSTRAINT audit_retention_category_configs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: cron_job_runs cron_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs
    ADD CONSTRAINT cron_job_runs_pkey PRIMARY KEY (job_name, tenant_id, local_date);


--
-- Name: data_subject_erasure_requests data_subject_erasure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_subject_erasure_requests
    ADD CONSTRAINT data_subject_erasure_requests_pkey PRIMARY KEY (id);


--
-- Name: financial_entries financial_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: inspection_executions inspection_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_executions
    ADD CONSTRAINT inspection_executions_pkey PRIMARY KEY (id);


--
-- Name: inspector_availability_slots inspector_availability_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_availability_slots
    ADD CONSTRAINT inspector_availability_slots_pkey PRIMARY KEY (id);


--
-- Name: inspector_invoices inspector_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_invoices
    ADD CONSTRAINT inspector_invoices_pkey PRIMARY KEY (id);


--
-- Name: inspector_regions inspector_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_regions
    ADD CONSTRAINT inspector_regions_pkey PRIMARY KEY (inspector_id, region_id);


--
-- Name: inspectors inspectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectors
    ADD CONSTRAINT inspectors_pkey PRIMARY KEY (id);


--
-- Name: integration_settings integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (id);


--
-- Name: notification_attempts notification_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_attempts
    ADD CONSTRAINT notification_attempts_pkey PRIMARY KEY (id);


--
-- Name: notification_consents notification_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_consents
    ADD CONSTRAINT notification_consents_pkey PRIMARY KEY (id);


--
-- Name: notification_consents notification_consents_recipient_channel_tenant_id_notificat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_consents
    ADD CONSTRAINT notification_consents_recipient_channel_tenant_id_notificat_key UNIQUE (recipient, channel, tenant_id, notification_class);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_history password_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pii_field_mappings pii_field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pii_field_mappings
    ADD CONSTRAINT pii_field_mappings_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: satisfaction_surveys satisfaction_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfaction_surveys
    ADD CONSTRAINT satisfaction_surveys_pkey PRIMARY KEY (id);


--
-- Name: service_groups service_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups
    ADD CONSTRAINT service_groups_pkey PRIMARY KEY (id);


--
-- Name: service_price_rules service_price_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_price_rules
    ADD CONSTRAINT service_price_rules_pkey PRIMARY KEY (id);


--
-- Name: service_regions service_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_regions
    ADD CONSTRAINT service_regions_pkey PRIMARY KEY (id);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: rental_tenant_portal_activities_archive tenant_portal_activities_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_activities_archive
    ADD CONSTRAINT tenant_portal_activities_archive_pkey PRIMARY KEY (id);


--
-- Name: rental_tenant_portal_activities tenant_portal_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_activities
    ADD CONSTRAINT tenant_portal_activities_pkey PRIMARY KEY (id);


--
-- Name: rental_tenant_portal_tokens tenant_portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_tokens
    ADD CONSTRAINT tenant_portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: AuditLog_fulltext_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_fulltext_idx" ON public.audit_logs USING gin (to_tsvector('english'::regconfig, ((COALESCE(reason, ''::text) || ' '::text) || COALESCE((metadata_json)::text, ''::text))));


--
-- Name: api_keys_key_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_keys_key_hash_key ON public.api_keys USING btree (key_hash);


--
-- Name: api_keys_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_revoked_at_idx ON public.api_keys USING btree (revoked_at);


--
-- Name: app_credentials_tenant_id_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_credentials_tenant_id_branch_id_idx ON public.app_credentials USING btree (tenant_id, branch_id);


--
-- Name: app_credentials_tenant_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_credentials_tenant_id_is_active_idx ON public.app_credentials USING btree (tenant_id, is_active);


--
-- Name: app_credentials_tenant_id_is_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_credentials_tenant_id_is_default_idx ON public.app_credentials USING btree (tenant_id, is_default);


--
-- Name: app_credentials_tenant_id_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_credentials_tenant_id_name_idx ON public.app_credentials USING btree (tenant_id, name);


--
-- Name: appointment_active_cycle_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_active_cycle_unique ON public.appointment_confirmation_cycles USING btree (appointment_id) WHERE (status <> 'SUPERSEDED'::public."CycleStatus");


--
-- Name: appointment_app_credentials_app_credential_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_app_credentials_app_credential_id_idx ON public.appointment_app_credentials USING btree (app_credential_id);


--
-- Name: appointment_app_credentials_appointment_id_app_credential_i_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_app_credentials_appointment_id_app_credential_i_key ON public.appointment_app_credentials USING btree (appointment_id, app_credential_id);


--
-- Name: appointment_app_credentials_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_app_credentials_appointment_id_idx ON public.appointment_app_credentials USING btree (appointment_id);


--
-- Name: appointment_confirmation_cycles_appointment_id_cycle_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_confirmation_cycles_appointment_id_cycle_number_key ON public.appointment_confirmation_cycles USING btree (appointment_id, cycle_number);


--
-- Name: appointment_confirmation_cycles_appointment_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_confirmation_cycles_appointment_id_status_idx ON public.appointment_confirmation_cycles USING btree (appointment_id, status);


--
-- Name: appointment_confirmation_cycles_portal_token_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_confirmation_cycles_portal_token_id_key ON public.appointment_confirmation_cycles USING btree (portal_token_id);


--
-- Name: appointment_contacts_appointment_contact_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_contacts_appointment_contact_unique ON public.appointment_contacts USING btree (appointment_id, contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: appointment_contacts_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_contacts_appointment_id_idx ON public.appointment_contacts USING btree (appointment_id);


--
-- Name: appointment_contacts_appointment_primary_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_contacts_appointment_primary_unique ON public.appointment_contacts USING btree (appointment_id) WHERE (is_primary = true);


--
-- Name: appointment_contacts_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_contacts_contact_id_idx ON public.appointment_contacts USING btree (contact_id);


--
-- Name: appointment_imports_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_imports_created_at_idx ON public.appointment_imports USING btree (created_at);


--
-- Name: appointment_imports_created_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_imports_created_by_user_id_idx ON public.appointment_imports USING btree (created_by_user_id);


--
-- Name: appointment_imports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_imports_status_idx ON public.appointment_imports USING btree (status);


--
-- Name: appointment_imports_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_imports_tenant_id_idx ON public.appointment_imports USING btree (tenant_id);


--
-- Name: appointment_restrictions_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_restrictions_appointment_id_idx ON public.appointment_restrictions USING btree (appointment_id);


--
-- Name: appointments_appointment_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointments_appointment_number_key ON public.appointments USING btree (appointment_number);


--
-- Name: appointments_inspector_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_inspector_id_status_idx ON public.appointments USING btree (inspector_id, status);


--
-- Name: appointments_scheduled_date_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_scheduled_date_inspector_id_idx ON public.appointments USING btree (scheduled_date, inspector_id);


--
-- Name: appointments_service_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_service_group_id_idx ON public.appointments USING btree (service_group_id);


--
-- Name: appointments_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_status_created_at_idx ON public.appointments USING btree (status, created_at);


--
-- Name: appointments_tenant_id_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_tenant_id_branch_id_idx ON public.appointments USING btree (tenant_id, branch_id);


--
-- Name: appointments_tenant_id_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_tenant_id_inspector_id_idx ON public.appointments USING btree (tenant_id, inspector_id);


--
-- Name: appointments_tenant_id_scheduled_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_tenant_id_scheduled_date_idx ON public.appointments USING btree (tenant_id, scheduled_date);


--
-- Name: appointments_tenant_id_service_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_tenant_id_service_type_id_idx ON public.appointments USING btree (tenant_id, service_type_id);


--
-- Name: appointments_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_tenant_id_status_idx ON public.appointments USING btree (tenant_id, status);


--
-- Name: audit_legal_holds_entity_type_entity_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_legal_holds_entity_type_entity_id_is_active_idx ON public.audit_legal_holds USING btree (entity_type, entity_id, is_active);


--
-- Name: audit_legal_holds_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_legal_holds_tenant_id_idx ON public.audit_legal_holds USING btree (tenant_id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id);


--
-- Name: audit_logs_archive_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_action_idx ON public.audit_logs_archive USING btree (action);


--
-- Name: audit_logs_archive_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_actor_id_idx ON public.audit_logs_archive USING btree (actor_id);


--
-- Name: audit_logs_archive_archived_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_archived_at_idx ON public.audit_logs_archive USING btree (archived_at);


--
-- Name: audit_logs_archive_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_created_at_idx ON public.audit_logs_archive USING btree (created_at);


--
-- Name: audit_logs_archive_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_entity_type_entity_id_idx ON public.audit_logs_archive USING btree (entity_type, entity_id);


--
-- Name: audit_logs_archive_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_archive_tenant_id_idx ON public.audit_logs_archive USING btree (tenant_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_type_entity_id_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: audit_logs_redaction_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_redaction_status_idx ON public.audit_logs USING btree (redaction_status);


--
-- Name: audit_logs_retention_category_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_retention_category_created_at_idx ON public.audit_logs USING btree (retention_category, created_at);


--
-- Name: audit_logs_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_tenant_id_idx ON public.audit_logs USING btree (tenant_id);


--
-- Name: audit_preservation_rules_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_preservation_rules_entity_type_entity_id_idx ON public.audit_preservation_rules USING btree (entity_type, entity_id);


--
-- Name: audit_preservation_rules_rule_type_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_preservation_rules_rule_type_is_active_idx ON public.audit_preservation_rules USING btree (rule_type, is_active);


--
-- Name: audit_retention_category_configs_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_retention_category_configs_name_key ON public.audit_retention_category_configs USING btree (name);


--
-- Name: branches_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_tenant_id_idx ON public.branches USING btree (tenant_id);


--
-- Name: branches_tenant_id_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_tenant_id_name_idx ON public.branches USING btree (tenant_id, name);


--
-- Name: branches_tenant_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_tenant_id_name_key ON public.branches USING btree (tenant_id, lower((name)::text));


--
-- Name: branches_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_tenant_id_status_idx ON public.branches USING btree (tenant_id, status);


--
-- Name: contacts_display_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_display_name_trgm_idx ON public.contacts USING gin (display_name public.gin_trgm_ops);


--
-- Name: contacts_email_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_email_active_unique ON public.contacts USING btree (primary_email) WHERE ((is_active = true) AND (primary_email IS NOT NULL));


--
-- Name: contacts_phone_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_phone_active_unique ON public.contacts USING btree (primary_phone) WHERE ((is_active = true) AND (primary_phone IS NOT NULL));


--
-- Name: contacts_tenant_id_display_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_id_display_name_idx ON public.contacts USING btree (tenant_id, display_name);


--
-- Name: contacts_tenant_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_id_is_active_idx ON public.contacts USING btree (tenant_id, is_active);


--
-- Name: contacts_tenant_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_id_type_idx ON public.contacts USING btree (tenant_id, type);


--
-- Name: data_subject_erasure_requests_initiated_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_subject_erasure_requests_initiated_by_user_id_idx ON public.data_subject_erasure_requests USING btree (initiated_by_user_id);


--
-- Name: data_subject_erasure_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_subject_erasure_requests_status_idx ON public.data_subject_erasure_requests USING btree (status);


--
-- Name: financial_entries_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_appointment_id_idx ON public.financial_entries USING btree (appointment_id);


--
-- Name: financial_entries_effective_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_effective_at_idx ON public.financial_entries USING btree (effective_at);


--
-- Name: financial_entries_entry_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_entry_type_idx ON public.financial_entries USING btree (entry_type);


--
-- Name: financial_entries_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_inspector_id_idx ON public.financial_entries USING btree (inspector_id);


--
-- Name: financial_entries_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_status_idx ON public.financial_entries USING btree (status);


--
-- Name: financial_entries_tenant_id_entry_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_tenant_id_entry_type_status_idx ON public.financial_entries USING btree (tenant_id, entry_type, status);


--
-- Name: financial_entries_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_entries_tenant_id_idx ON public.financial_entries USING btree (tenant_id);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idempotency_keys_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idempotency_keys_key_key ON public.idempotency_keys USING btree (key);


--
-- Name: idempotency_keys_key_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_key_scope_idx ON public.idempotency_keys USING btree (key, scope);


--
-- Name: inspection_executions_appointment_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inspection_executions_appointment_id_key ON public.inspection_executions USING btree (appointment_id);


--
-- Name: inspection_executions_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspection_executions_inspector_id_idx ON public.inspection_executions USING btree (inspector_id);


--
-- Name: inspection_executions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspection_executions_started_at_idx ON public.inspection_executions USING btree (started_at);


--
-- Name: inspector_availability_slots_inspector_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_availability_slots_inspector_id_date_idx ON public.inspector_availability_slots USING btree (inspector_id, date);


--
-- Name: inspector_availability_slots_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_availability_slots_inspector_id_idx ON public.inspector_availability_slots USING btree (inspector_id);


--
-- Name: inspector_availability_slots_inspector_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_availability_slots_inspector_id_status_idx ON public.inspector_availability_slots USING btree (inspector_id, status);


--
-- Name: inspector_invoices_active_period_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inspector_invoices_active_period_unique ON public.inspector_invoices USING btree (inspector_id, period_start, period_end) WHERE (status = ANY (ARRAY['PENDING_REVIEW'::public."InspectorInvoiceStatus", 'CLOSED'::public."InspectorInvoiceStatus", 'PAID'::public."InspectorInvoiceStatus"]));


--
-- Name: inspector_invoices_inspector_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_invoices_inspector_id_status_idx ON public.inspector_invoices USING btree (inspector_id, status);


--
-- Name: inspector_invoices_invoice_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inspector_invoices_invoice_number_key ON public.inspector_invoices USING btree (invoice_number);


--
-- Name: inspector_invoices_line_items_snapshot_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_invoices_line_items_snapshot_gin ON public.inspector_invoices USING gin (line_items_snapshot jsonb_path_ops);


--
-- Name: inspector_invoices_period_start_period_end_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_invoices_period_start_period_end_idx ON public.inspector_invoices USING btree (period_start, period_end);


--
-- Name: inspector_regions_region_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspector_regions_region_id_idx ON public.inspector_regions USING btree (region_id);


--
-- Name: inspectors_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inspectors_email_key ON public.inspectors USING btree (email);


--
-- Name: inspectors_insurance_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspectors_insurance_expires_at_idx ON public.inspectors USING btree (insurance_expires_at);


--
-- Name: inspectors_police_check_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspectors_police_check_expires_at_idx ON public.inspectors USING btree (police_check_expires_at);


--
-- Name: inspectors_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspectors_status_idx ON public.inspectors USING btree (status);


--
-- Name: inspectors_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspectors_user_id_idx ON public.inspectors USING btree (user_id);


--
-- Name: inspectors_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inspectors_user_id_key ON public.inspectors USING btree (user_id);


--
-- Name: integration_settings_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_settings_provider_key ON public.integration_settings USING btree (provider);


--
-- Name: notification_attempts_notification_id_attempt_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_attempts_notification_id_attempt_number_idx ON public.notification_attempts USING btree (notification_id, attempt_number);


--
-- Name: notification_attempts_notification_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_attempts_notification_id_idx ON public.notification_attempts USING btree (notification_id);


--
-- Name: notification_consents_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_consents_tenant_id_idx ON public.notification_consents USING btree (tenant_id);


--
-- Name: notification_templates_template_code_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_templates_template_code_channel_idx ON public.notification_templates USING btree (template_code, channel);


--
-- Name: notification_templates_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_templates_tenant_id_idx ON public.notification_templates USING btree (tenant_id);


--
-- Name: notification_templates_tenant_id_template_code_channel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_templates_tenant_id_template_code_channel_key ON public.notification_templates USING btree (tenant_id, template_code, channel);


--
-- Name: notifications_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_appointment_id_idx ON public.notifications USING btree (appointment_id);


--
-- Name: notifications_channel_status_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_channel_status_sent_at_idx ON public.notifications USING btree (channel, status, sent_at);


--
-- Name: notifications_next_retry_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_next_retry_at_idx ON public.notifications USING btree (next_retry_at);


--
-- Name: notifications_provider_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_provider_message_id_idx ON public.notifications USING btree (provider_message_id);


--
-- Name: notifications_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_status_idx ON public.notifications USING btree (status);


--
-- Name: notifications_template_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_template_code_idx ON public.notifications USING btree (template_code);


--
-- Name: notifications_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_tenant_id_idx ON public.notifications USING btree (tenant_id);


--
-- Name: password_history_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_history_user_id_created_at_idx ON public.password_history USING btree (user_id, created_at);


--
-- Name: password_history_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_history_user_id_idx ON public.password_history USING btree (user_id);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_token_hash_idx ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: pii_field_mappings_action_pattern_json_field_path_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pii_field_mappings_action_pattern_json_field_path_key ON public.pii_field_mappings USING btree (action_pattern, json_field_path);


--
-- Name: pii_field_mappings_classification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pii_field_mappings_classification_idx ON public.pii_field_mappings USING btree (classification);


--
-- Name: properties_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_branch_id_idx ON public.properties USING btree (branch_id);


--
-- Name: properties_coordinates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_coordinates_idx ON public.properties USING gist (coordinates);


--
-- Name: properties_normalized_address_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX properties_normalized_address_active_unique ON public.properties USING btree (tenant_id, normalized_address_key) WHERE (deleted_at IS NULL);


--
-- Name: properties_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_tenant_id_idx ON public.properties USING btree (tenant_id);


--
-- Name: properties_tenant_id_property_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX properties_tenant_id_property_code_key ON public.properties USING btree (tenant_id, property_code);


--
-- Name: properties_tenant_id_property_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX properties_tenant_id_property_number_key ON public.properties USING btree (tenant_id, property_number);


--
-- Name: properties_tenant_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_tenant_id_type_idx ON public.properties USING btree (tenant_id, type);


--
-- Name: reports_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_created_at_idx ON public.reports USING btree (created_at);


--
-- Name: reports_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_expires_at_idx ON public.reports USING btree (expires_at);


--
-- Name: reports_report_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_report_type_idx ON public.reports USING btree (report_type);


--
-- Name: reports_requested_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_requested_by_user_id_idx ON public.reports USING btree (requested_by_user_id);


--
-- Name: reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_status_idx ON public.reports USING btree (status);


--
-- Name: reports_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_tenant_id_idx ON public.reports USING btree (tenant_id);


--
-- Name: satisfaction_surveys_appointment_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX satisfaction_surveys_appointment_id_key ON public.satisfaction_surveys USING btree (appointment_id);


--
-- Name: satisfaction_surveys_inspector_id_tenant_id_submitted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfaction_surveys_inspector_id_tenant_id_submitted_at_idx ON public.satisfaction_surveys USING btree (inspector_id, tenant_id, submitted_at DESC);


--
-- Name: satisfaction_surveys_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfaction_surveys_tenant_id_idx ON public.satisfaction_surveys USING btree (tenant_id);


--
-- Name: service_groups_assigned_inspector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_groups_assigned_inspector_id_idx ON public.service_groups USING btree (assigned_inspector_id);


--
-- Name: service_groups_group_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_groups_group_number_key ON public.service_groups USING btree (group_number);


--
-- Name: service_groups_scheduled_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_groups_scheduled_date_idx ON public.service_groups USING btree (scheduled_date);


--
-- Name: service_groups_service_region_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_groups_service_region_id_idx ON public.service_groups USING btree (service_region_id);


--
-- Name: service_groups_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_groups_status_idx ON public.service_groups USING btree (status);


--
-- Name: service_price_rules_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_price_rules_branch_id_idx ON public.service_price_rules USING btree (branch_id);


--
-- Name: service_price_rules_service_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_price_rules_service_type_id_idx ON public.service_price_rules USING btree (service_type_id);


--
-- Name: service_price_rules_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_price_rules_tenant_id_idx ON public.service_price_rules USING btree (tenant_id);


--
-- Name: service_price_rules_tenant_id_service_type_id_branch_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_price_rules_tenant_id_service_type_id_branch_id_key ON public.service_price_rules USING btree (tenant_id, service_type_id, branch_id);


--
-- Name: service_price_rules_tenant_service_type_no_branch_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_price_rules_tenant_service_type_no_branch_key ON public.service_price_rules USING btree (tenant_id, service_type_id) WHERE (branch_id IS NULL);


--
-- Name: service_regions_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_regions_geom_idx ON public.service_regions USING gist (geom);


--
-- Name: service_regions_region_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_regions_region_number_key ON public.service_regions USING btree (region_number);


--
-- Name: service_regions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_regions_status_idx ON public.service_regions USING btree (status);


--
-- Name: service_regions_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_regions_tenant_id_idx ON public.service_regions USING btree (tenant_id);


--
-- Name: service_regions_tenant_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_regions_tenant_id_name_key ON public.service_regions USING btree (tenant_id, name);


--
-- Name: service_types_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_types_code_key ON public.service_types USING btree (code);


--
-- Name: service_types_name_ci_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_types_name_ci_key ON public.service_types USING btree (lower((name)::text));


--
-- Name: service_types_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_types_status_idx ON public.service_types USING btree (status);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_refresh_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_refresh_token_hash_idx ON public.sessions USING btree (refresh_token_hash);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: sessions_user_id_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_revoked_at_idx ON public.sessions USING btree (user_id, revoked_at);


--
-- Name: tenant_portal_activities_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_action_idx ON public.rental_tenant_portal_activities USING btree (action);


--
-- Name: tenant_portal_activities_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_appointment_id_idx ON public.rental_tenant_portal_activities USING btree (appointment_id);


--
-- Name: tenant_portal_activities_archive_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_archive_action_idx ON public.rental_tenant_portal_activities_archive USING btree (action);


--
-- Name: tenant_portal_activities_archive_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_archive_appointment_id_idx ON public.rental_tenant_portal_activities_archive USING btree (appointment_id);


--
-- Name: tenant_portal_activities_archive_archived_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_archive_archived_at_idx ON public.rental_tenant_portal_activities_archive USING btree (archived_at);


--
-- Name: tenant_portal_activities_archive_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_archive_created_at_idx ON public.rental_tenant_portal_activities_archive USING btree (created_at);


--
-- Name: tenant_portal_activities_archive_tenant_portal_token_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_archive_tenant_portal_token_id_idx ON public.rental_tenant_portal_activities_archive USING btree (rental_tenant_portal_token_id);


--
-- Name: tenant_portal_activities_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_created_at_idx ON public.rental_tenant_portal_activities USING btree (created_at);


--
-- Name: tenant_portal_activities_redaction_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_redaction_status_idx ON public.rental_tenant_portal_activities USING btree (redaction_status);


--
-- Name: tenant_portal_activities_tenant_portal_token_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_activities_tenant_portal_token_id_idx ON public.rental_tenant_portal_activities USING btree (rental_tenant_portal_token_id);


--
-- Name: tenant_portal_tokens_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_tokens_appointment_id_idx ON public.rental_tenant_portal_tokens USING btree (appointment_id);


--
-- Name: tenant_portal_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_tokens_expires_at_idx ON public.rental_tenant_portal_tokens USING btree (expires_at);


--
-- Name: tenant_portal_tokens_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_portal_tokens_status_idx ON public.rental_tenant_portal_tokens USING btree (status);


--
-- Name: tenant_portal_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_portal_tokens_token_hash_key ON public.rental_tenant_portal_tokens USING btree (token_hash);


--
-- Name: tenants_appointment_code_prefix_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_appointment_code_prefix_key ON public.tenants USING btree (appointment_code_prefix);


--
-- Name: tenants_legal_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_legal_name_key ON public.tenants USING btree (legal_name);


--
-- Name: tenants_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_status_idx ON public.tenants USING btree (status);


--
-- Name: users_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_branch_id_idx ON public.users USING btree (branch_id);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: users_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_tenant_id_idx ON public.users USING btree (tenant_id);


--
-- Name: users_tenant_id_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_tenant_id_role_idx ON public.users USING btree (tenant_id, role);


--
-- Name: users_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_tenant_id_status_idx ON public.users USING btree (tenant_id, status);


--
-- Name: properties properties_normalize_address_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER properties_normalize_address_trigger BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.normalize_property_address();


--
-- Name: app_credentials app_credentials_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_credentials
    ADD CONSTRAINT app_credentials_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: app_credentials app_credentials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_credentials
    ADD CONSTRAINT app_credentials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointment_app_credentials appointment_app_credentials_app_credential_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_app_credentials
    ADD CONSTRAINT appointment_app_credentials_app_credential_id_fkey FOREIGN KEY (app_credential_id) REFERENCES public.app_credentials(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointment_app_credentials appointment_app_credentials_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_app_credentials
    ADD CONSTRAINT appointment_app_credentials_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointment_confirmation_cycles appointment_confirmation_cycles_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_confirmation_cycles
    ADD CONSTRAINT appointment_confirmation_cycles_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointment_confirmation_cycles appointment_confirmation_cycles_portal_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_confirmation_cycles
    ADD CONSTRAINT appointment_confirmation_cycles_portal_token_id_fkey FOREIGN KEY (portal_token_id) REFERENCES public.rental_tenant_portal_tokens(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointment_contacts appointment_contacts_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_contacts
    ADD CONSTRAINT appointment_contacts_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointment_contacts appointment_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_contacts
    ADD CONSTRAINT appointment_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointment_imports appointment_imports_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_imports
    ADD CONSTRAINT appointment_imports_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointment_imports appointment_imports_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_imports
    ADD CONSTRAINT appointment_imports_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointment_imports appointment_imports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_imports
    ADD CONSTRAINT appointment_imports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointment_restrictions appointment_restrictions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_restrictions
    ADD CONSTRAINT appointment_restrictions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointments appointments_active_confirmation_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_active_confirmation_cycle_id_fkey FOREIGN KEY (active_confirmation_cycle_id) REFERENCES public.appointment_confirmation_cycles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments appointments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_done_checked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_done_checked_by_user_id_fkey FOREIGN KEY (done_checked_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments appointments_done_marked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_done_marked_by_user_id_fkey FOREIGN KEY (done_marked_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments appointments_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments appointments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_service_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_service_group_id_fkey FOREIGN KEY (service_group_id) REFERENCES public.service_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments appointments_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_preservation_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_preservation_rule_id_fkey FOREIGN KEY (preservation_rule_id) REFERENCES public.audit_preservation_rules(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: contacts contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cron_job_runs cron_job_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs
    ADD CONSTRAINT cron_job_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: financial_entries financial_entries_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: financial_entries financial_entries_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: financial_entries financial_entries_initiated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_initiated_by_user_id_fkey FOREIGN KEY (initiated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: financial_entries financial_entries_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: financial_entries financial_entries_reference_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_reference_entry_id_fkey FOREIGN KEY (reference_entry_id) REFERENCES public.financial_entries(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: financial_entries financial_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: financial_entries financial_entries_voided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inspection_executions inspection_executions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_executions
    ADD CONSTRAINT inspection_executions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inspection_executions inspection_executions_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_executions
    ADD CONSTRAINT inspection_executions_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inspector_availability_slots inspector_availability_slots_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_availability_slots
    ADD CONSTRAINT inspector_availability_slots_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inspector_invoices inspector_invoices_generated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_invoices
    ADD CONSTRAINT inspector_invoices_generated_by_user_id_fkey FOREIGN KEY (generated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inspector_invoices inspector_invoices_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_invoices
    ADD CONSTRAINT inspector_invoices_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inspector_invoices inspector_invoices_paid_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_invoices
    ADD CONSTRAINT inspector_invoices_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inspector_regions inspector_regions_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_regions
    ADD CONSTRAINT inspector_regions_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inspector_regions inspector_regions_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspector_regions
    ADD CONSTRAINT inspector_regions_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.service_regions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inspectors inspectors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectors
    ADD CONSTRAINT inspectors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notification_attempts notification_attempts_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_attempts
    ADD CONSTRAINT notification_attempts_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notification_consents notification_consents_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_consents
    ADD CONSTRAINT notification_consents_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notification_templates notification_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: password_history password_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: properties properties_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: properties properties_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reports reports_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reports reports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: satisfaction_surveys satisfaction_surveys_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfaction_surveys
    ADD CONSTRAINT satisfaction_surveys_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: satisfaction_surveys satisfaction_surveys_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfaction_surveys
    ADD CONSTRAINT satisfaction_surveys_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: satisfaction_surveys satisfaction_surveys_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfaction_surveys
    ADD CONSTRAINT satisfaction_surveys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_groups service_groups_assigned_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups
    ADD CONSTRAINT service_groups_assigned_inspector_id_fkey FOREIGN KEY (assigned_inspector_id) REFERENCES public.inspectors(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_groups service_groups_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups
    ADD CONSTRAINT service_groups_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_groups service_groups_service_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups
    ADD CONSTRAINT service_groups_service_region_id_fkey FOREIGN KEY (service_region_id) REFERENCES public.service_regions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_groups service_groups_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_groups
    ADD CONSTRAINT service_groups_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_price_rules service_price_rules_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_price_rules
    ADD CONSTRAINT service_price_rules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_price_rules service_price_rules_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_price_rules
    ADD CONSTRAINT service_price_rules_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_price_rules service_price_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_price_rules
    ADD CONSTRAINT service_price_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_regions service_regions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_regions
    ADD CONSTRAINT service_regions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_regions service_regions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_regions
    ADD CONSTRAINT service_regions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_tenant_portal_activities tenant_portal_activities_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_activities
    ADD CONSTRAINT tenant_portal_activities_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_tenant_portal_activities tenant_portal_activities_tenant_portal_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_activities
    ADD CONSTRAINT tenant_portal_activities_tenant_portal_token_id_fkey FOREIGN KEY (rental_tenant_portal_token_id) REFERENCES public.rental_tenant_portal_tokens(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_tenant_portal_tokens tenant_portal_tokens_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_tokens
    ADD CONSTRAINT tenant_portal_tokens_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_tenant_portal_tokens tenant_portal_tokens_confirmation_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_tenant_portal_tokens
    ADD CONSTRAINT tenant_portal_tokens_confirmation_cycle_id_fkey FOREIGN KEY (confirmation_cycle_id) REFERENCES public.appointment_confirmation_cycles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

-- Reference data (rows that survive a clean replay of the old history)
INSERT INTO public.audit_retention_category_configs VALUES ('4614762e-6090-4154-a7e6-44982ed8c5ef', 'FINANCIAL', 7, false, 'Financial / fiscal audit entries (billing, refund, invoice, manual adjustment). 7-year retention per Brazilian fiscal legislation.', '["financial.", "billing.", "invoice.", "refund.", "manualAdjustment."]', '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.audit_retention_category_configs VALUES ('35f8c199-e69a-4072-8933-de27a9d87b46', 'OPERATIONAL_CRITICAL', 5, false, 'Appointment status transitions, cross-check actions, user/inspector lifecycle, permission changes. 5-year retention per Brazilian Civil Code general prescription period.', '[]', '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.audit_retention_category_configs VALUES ('3a15d841-2191-463e-8f19-4fdd539e8ca7', 'OPERATIONAL_GENERAL', 2, false, 'Read access logs, auth success events, portal views. 2-year retention for high-volume low-value audit entries.', '["auth.loginSuccess", "auth.refreshToken", "auth.tokenVerified", "portal.view", "read."]', '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.notification_templates VALUES ('816d8e94-b8ba-4f66-b386-f5cf2003633d', NULL, 'INSPECTION_CANCELLED_AGENCY', 'EMAIL', 'Inspection Cancelled - {{propertyAddress}}', '<p>The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been cancelled.</p>', 'The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been cancelled.', '["propertyAddress", "appointmentCode", "scheduledDate"]', true, '2026-08-06 13:29:57.518', '2026-08-06 13:29:57.518', 'TRANSACTIONAL');
INSERT INTO public.notification_templates VALUES ('2cfbc27a-89f4-497f-aa3f-682d3c47482b', NULL, 'TENANT_NOTICE_FORWARDED_AGENCY', 'EMAIL', 'Tenant notice not sent - {{propertyAddress}}', '<p>Your agency contacts tenants directly, so Properfy did not send "{{suppressedTemplateLabel}}" for inspection {{appointmentCode}} at {{propertyAddress}} on {{scheduledDate}}. Please pass it on to the tenant.</p>', 'Your agency contacts tenants directly, so Properfy did not send "{{suppressedTemplateLabel}}" for inspection {{appointmentCode}} at {{propertyAddress}} on {{scheduledDate}}. Please pass it on to the tenant.', '["suppressedTemplateLabel", "suppressedChannel", "propertyAddress", "appointmentCode", "scheduledDate"]', true, '2026-08-06 13:29:57.525', '2026-08-06 13:29:57.525', 'TRANSACTIONAL');
INSERT INTO public.notification_templates VALUES ('3dfa3a88-c764-464b-8571-fc3a7c567f7d', NULL, 'INSPECTION_SATISFACTION_SURVEY', 'EMAIL', 'How did your inspection go?', '<p>Your inspection has been completed. Tell us how it went: <a href="{{surveyLink}}">Rate your inspection</a></p>', 'Your inspection has been completed. Tell us how it went: {{surveyLink}}', '["surveyLink"]', true, '2026-08-06 13:29:57.596', '2026-08-06 13:29:57.596', 'OPERATIONAL');
INSERT INTO public.pii_field_mappings VALUES ('78cbd8a1-35ef-4932-857f-3be4f542e7e6', 'user.', 'email', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('31179bbd-6e74-4315-867c-9bd1bd85f804', 'user.', 'phone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('ca105fa1-7e78-41f5-88c8-abb3442b8df8', 'user.', 'name', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('fecb75c2-2ab7-4104-8bcf-e2227b4cfc3f', 'inspector.', 'email', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('8b26892c-f1ad-4c80-9e19-6b93f557ae23', 'inspector.', 'phone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('6168681e-dab8-4f4e-8910-9ee6f7e1172e', 'inspector.', 'name', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('20bd2991-9af3-4a0b-aed5-1397668bfe18', 'auth.', 'email', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('33a37252-b4ee-4276-a33b-d4250b30e590', 'auth.', 'phone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('41496476-5168-48d3-a9ad-41b4d57f45d7', 'auth.', 'name', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('51779b9c-10c6-4daa-ab62-724f5a9a1b9f', 'portal.', 'primaryEmail', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('70e805fa-cfa1-47cd-b598-238ce9ed4cde', 'portal.', 'primaryPhone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('932ebf90-8237-4011-9f23-dac65baf9dfb', 'portal.', 'email', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('5129b8c6-7888-4c5c-96af-192c2a2de50e', 'portal.', 'phone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('95bbfc33-c4d7-48d4-84ee-6bed8eea5fcf', 'portal.', 'name', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('c428e376-631d-4877-9caf-1e66ba404235', 'appointment.', 'contact.tenantName', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('31c027a1-9d34-4e58-ae83-a36843e51571', 'appointment.', 'contact.primaryEmail', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('8db2340a-3df9-4db6-9615-73f569df7782', 'appointment.', 'contact.primaryPhone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('3a624405-017f-4713-92df-d08223a3ae6c', 'appointment.', 'tenantName', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('50061af3-170a-4805-87f6-a6fea7acde7b', 'appointment.', 'tenantEmail', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('d341dc0c-efde-4d43-a012-7d6b268e1985', 'appointment.', 'tenantPhone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('c20db2e5-e7f7-4095-a672-3ec1f3728a07', 'inspector.', 'paymentSettingsJson', 'sensitive_financial', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('e00b9f9a-9556-431a-9ab6-c4085c711190', 'appointment.status_transition', 'metadata.inspectorName', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('4abc7b12-2db9-454f-8cbc-776a7ec985fe', 'appointment.', 'customFieldsJson', 'unstructured', true, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('80109ca7-e9aa-45cf-86a5-f6da53e538cb', 'portal.', 'secondaryEmail', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
INSERT INTO public.pii_field_mappings VALUES ('230b5df8-6f4b-4bda-8b48-6837afd13486', 'portal.', 'secondaryPhone', 'direct', false, '2026-08-06 13:29:56.746', '2026-08-06 13:29:56.746');
