-- Financial entries minted by the system (DONE debit/payout, DONE→REJECTED
-- compensations) have no human initiator. The FK to users required a real row,
-- so those inserts failed and were silently swallowed, leaving the ledger empty.
-- Allow a null initiator; existing non-null rows remain valid (expand migration).
ALTER TABLE "financial_entries" ALTER COLUMN "initiated_by_user_id" DROP NOT NULL;
