-- Inspector profile fields (Feedback Round item 6)
ALTER TABLE "inspectors" ADD COLUMN "full_name" VARCHAR(300);
ALTER TABLE "inspectors" ADD COLUMN "address" JSONB;
ALTER TABLE "inspectors" ADD COLUMN "abn" VARCHAR(20);
ALTER TABLE "inspectors" ADD COLUMN "date_of_birth" DATE;
ALTER TABLE "inspectors" ADD COLUMN "insurance_file_key" TEXT;
ALTER TABLE "inspectors" ADD COLUMN "insurance_expires_at" DATE;
ALTER TABLE "inspectors" ADD COLUMN "police_check_file_key" TEXT;
ALTER TABLE "inspectors" ADD COLUMN "police_check_expires_at" DATE;

-- Indexes for expiration queries (future "expiring soon" reports)
CREATE INDEX "inspectors_insurance_expires_at_idx" ON "inspectors" ("insurance_expires_at");
CREATE INDEX "inspectors_police_check_expires_at_idx" ON "inspectors" ("police_check_expires_at");

-- Blocked-clients model (Feedback Round item 1)
ALTER TABLE "inspectors" ADD COLUMN "blocked_clients_json" JSONB NOT NULL DEFAULT '[]';

-- Data migration: complement of client_eligibility_json → blocked_clients_json
-- client_eligibility_json shape: [{ "tenantId": "uuid", "eligible": true/false }]
-- blocked = all active tenants NOT in the eligible set
UPDATE inspectors SET blocked_clients_json = (
  SELECT COALESCE(jsonb_agg(t.id), '[]'::jsonb)
  FROM tenants t
  WHERE t.status = 'ACTIVE'
    AND t.id::text NOT IN (
      SELECT e->>'tenantId'
      FROM jsonb_array_elements(inspectors.client_eligibility_json) AS e
      WHERE (e->>'eligible')::boolean = true
    )
)
WHERE jsonb_array_length(client_eligibility_json) > 0
  AND blocked_clients_json = '[]'::jsonb;

-- InspectorInvoice: add PENDING_REVIEW status + drafted_by_inspector_id
ALTER TYPE "InspectorInvoiceStatus" ADD VALUE 'PENDING_REVIEW' BEFORE 'OPEN';
ALTER TABLE "inspector_invoices" ADD COLUMN "drafted_by_inspector_id" TEXT;
