-- Q12 (F08-6): add the INSPECTOR_BONUS ledger type.
-- Alone in its own migration: PostgreSQL cannot use a newly added enum value in the
-- same transaction that defines it, and the CHECK constraints in the next migration
-- reference the value.
ALTER TYPE "FinancialEntryType" ADD VALUE 'INSPECTOR_BONUS';
