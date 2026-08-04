-- Personal IANA timezone for cross-tenant roles (AM/OP/INSP). NULL = platform
-- default. CL_* users always inherit the agency (tenants.timezone) value.
ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(60);

-- Exactly-once ledger for per-agency civil-day cron work: hourly tick workers
-- INSERT ... ON CONFLICT DO NOTHING against the PK and run only when the
-- insert lands (absorbs DST-repeated hours and missed-tick catch-up).
CREATE TABLE "cron_job_runs" (
    "job_name" VARCHAR(100) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_job_runs_pkey" PRIMARY KEY ("job_name","tenant_id","local_date")
);

ALTER TABLE "cron_job_runs" ADD CONSTRAINT "cron_job_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
