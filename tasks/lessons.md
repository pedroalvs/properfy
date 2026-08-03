# Lessons

## 2026-08-02 — Global idempotency key expiry precedes scope isolation

1. When an idempotency key is globally unique but logically partitioned by `scope`, remove an expired row before rejecting an active cross-scope collision; checking scope first can permanently strand a reusable key.
2. Cross-scope tests must cover both active rows, which must not leak responses, and expired rows, which must be eligible for fenced cleanup and reacquisition.

## 2026-08-02 — Atomic resend review gate

1. A path that promises atomicity must fail closed before its first mutation when the required Unit of Work is unavailable; never retain a legacy non-transactional fallback for that branch.
2. A rollback integration test must force failure after observing every intended write inside the real transaction, then assert that none survived; a guard failure before mutation does not prove atomic rollback.
3. Concurrency tests must wait for an observable database condition such as `pg_stat_activity.wait_event_type = 'Lock'`; a fixed sleep or timeout race is not evidence that the competing query started.
4. Once an authoritative row is locked with `FOR UPDATE`, pass the loaded context forward or perform the read only once; repeated reads under the same lock add work without closing another race.
5. Every flow that touches the same tenant/token/cycle rows must acquire row locks in one global order; atomic rollback prevents leaks but does not prevent deadlocks caused by inverted lock acquisition.
6. When a pre-write policy guard and later writes need the same entities, return an exactly-once prepared handle that retains the loaded context instead of re-reading or reversing the lock order.
