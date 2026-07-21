-- Data-only backfill: redact secret-bearing payload keys (raw reset/portal/invite
-- tokens and token-bearing links) in historical notification rows. New rows are
-- scrubbed by the application after a successful send; this covers everything
-- written before that behavior existed.
--
-- PENDING rows are excluded: their payload may still be re-rendered by the send
-- worker. Redacted FAILED rows become non-retryable by design (their tokens are
-- stale anyway) — the API rejects manual retry of scrubbed payloads.

UPDATE notifications
SET payload_json = payload_json || (
  SELECT jsonb_object_agg(k, to_jsonb('[REDACTED]'::text))
  FROM jsonb_object_keys(payload_json) AS k
  WHERE k IN ('resetLink', 'resetToken', 'confirmationLink', 'rescheduleLink', 'inviteToken')
)
WHERE status <> 'PENDING'
  AND payload_json ?| ARRAY['resetLink', 'resetToken', 'confirmationLink', 'rescheduleLink', 'inviteToken'];
