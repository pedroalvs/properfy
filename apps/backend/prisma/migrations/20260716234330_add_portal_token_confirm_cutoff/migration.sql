-- Decouple portal-token validity from the T-1 confirmation cutoff.
-- Legacy rows keep confirm_cutoff_at NULL; readers fall back to expires_at (identical semantics at mint time).
ALTER TABLE "rental_tenant_portal_tokens" ADD COLUMN "confirm_cutoff_at" TIMESTAMP(3);
