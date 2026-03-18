# Incident Response Runbook

## Severity Classification

| Severity | Description | Response Time | Examples |
|---|---|---|---|
| **S1** | Complete service outage or data integrity risk | 15 minutes | DB down, auth broken for all users, data corruption |
| **S2** | Degraded service, partial functionality affected | 60 minutes | One provider down (email/SMS), queue accumulation, slow queries |
| **S3** | Minor issue, workaround available | 1 business day | Single tenant affected, cosmetic API errors, non-critical job failures |

---

## Incident Checklist

### 1. Identify

- Confirm the issue is real (not a false alarm or local problem).
- Check `/health` and `/ready` endpoints.
- Check application logs (`fly logs` or Portainer logs).
- Determine severity level.

### 2. Communicate

- Notify the team with severity, symptoms, and estimated impact.
- For S1: immediate notification to all stakeholders.
- For S2/S3: update the team channel with status.

### 3. Mitigate

- Apply the quickest fix to restore service, even if temporary.
- Prioritize restoring availability over root cause analysis.
- Document what you changed for the post-mortem.

### 4. Resolve

- Implement the proper fix once the service is stable.
- Deploy through the normal process if time permits, or use the hotfix process.
- Verify the fix resolves the issue completely.

### 5. Post-Mortem

- Conduct within 48 hours of resolution.
- Use the post-mortem template below.
- Identify action items and assign owners.

---

## Common Scenarios

### Database Connection Failure

**Symptoms:** `/health` returns 503 with `"db": "disconnected"`. API requests return 500 errors.

**Diagnosis:**

```bash
# Check health endpoint
curl -s https://api.properfy.com.br/health | jq .

# Check DB directly
psql "$DIRECT_URL" -c "SELECT 1;"

# Check active connections
psql "$DIRECT_URL" -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();"
```

**Mitigation:**

1. Check Supabase status page for known outages.
2. Verify `DATABASE_URL` and `DIRECT_URL` are correct.
3. If connection pool is exhausted, restart the application to release connections.
4. If PgBouncer is unresponsive, test direct connection via `DIRECT_URL`.

### Notification Provider Outage

**Symptoms:** Notifications stuck in `PENDING` or `FAILED` status. Circuit breaker messages in logs: `Circuit breaker OPEN for resend-email`.

**Diagnosis:**

```sql
-- Check notification failure rate
SELECT channel, status, count(*)::int
FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY channel, status
ORDER BY channel, status;
```

**Mitigation:**

1. Check provider status pages (Resend, Twilio, Zenvia).
2. The circuit breaker will auto-recover after 60 seconds once the provider is back.
3. Failed notifications will be retried by `notification.retry-poll` (every 5 min).
4. If the outage is prolonged, notifications accumulate and will be sent once the provider recovers.
5. No manual intervention needed unless the DLQ monitor fires (10+ failed jobs).

### Queue Accumulation

**Symptoms:** Jobs piling up in `created` state. DLQ monitor alerts in logs. Features that depend on async processing stop working.

**Diagnosis:**

```sql
-- Check queue backlog
SELECT name, state, count(*)::int AS job_count
FROM pgboss.job
WHERE state IN ('created', 'active', 'retry', 'failed')
GROUP BY name, state
ORDER BY name, state;

-- Check if workers are consuming
SELECT name, max(completed_on) AS last_completed
FROM pgboss.job
WHERE state = 'completed'
GROUP BY name
ORDER BY last_completed DESC;
```

**Mitigation:**

1. Verify `ENABLE_JOB_QUEUE=true` is set.
2. Check application logs for worker registration (`pg-boss workers registered:`).
3. Restart the application if workers are not consuming.
4. If a specific worker is failing repeatedly, check the `output` column of failed jobs for error details.

### Authentication Issues

**Symptoms:** Users cannot log in. 401 errors across the API.

**Diagnosis:**

1. Check if the issue is account-specific (locked account) or system-wide (key issue).
2. For system-wide: verify JWT keys are correctly set.
3. Check for recent key rotation that may have misconfigured variables.

```sql
-- Check for locked accounts
SELECT id, email, status, failed_login_count, locked_until
FROM users
WHERE status = 'LOCKED';

-- Check recent login failures
SELECT entity_id, metadata, created_at
FROM audit_logs
WHERE action = 'auth.login_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

**Mitigation:**

- **Locked accounts:** See `auth-and-sessions.md` for unlock procedure.
- **Key issues:** Verify `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, and `JWT_KEY_ID` are set correctly. If a rotation went wrong, restore the previous key configuration.
- **Mass lockout:** Check for brute force attacks (high volume of `auth.login_failed` audit entries from the same IP).

---

## Hotfix Process

For S1 and urgent S2 incidents where the normal deploy process is too slow:

1. **Branch from `main`:** `git checkout -b hotfix/<description> main`
2. **Apply the minimal fix.** Change only what is necessary.
3. **Run essential checks:** typecheck and the tests directly related to the fix. Skip non-essential CI if time-critical.
4. **Deploy directly to staging.** Validate.
5. **Deploy to production.**
6. **Create a PR retroactively** with the full CI pipeline. Merge to `main`.
7. **Document** in the incident post-mortem that a hotfix was deployed.

---

## Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Severity:** S1 / S2 / S3
**Duration:** Start time - End time (total duration)
**Impact:** [Who/what was affected, and how]

## Timeline

| Time (UTC) | Event |
|---|---|
| HH:MM | [First symptom detected] |
| HH:MM | [Investigation started] |
| HH:MM | [Root cause identified] |
| HH:MM | [Mitigation applied] |
| HH:MM | [Service restored] |

## Root Cause

[Clear description of what caused the incident]

## 5 Whys

1. Why did [symptom] happen? Because [cause 1].
2. Why did [cause 1] happen? Because [cause 2].
3. Why did [cause 2] happen? Because [cause 3].
4. Why did [cause 3] happen? Because [cause 4].
5. Why did [cause 4] happen? Because [root cause].

## What Went Well

- [Things that helped detect or resolve the issue quickly]

## What Could Be Improved

- [Things that slowed detection or resolution]

## Action Items

| Action | Owner | Due Date | Status |
|---|---|---|---|
| [Action description] | [Name] | YYYY-MM-DD | Open |
```

---

## Useful Diagnostic Commands

```bash
# Fly.io: check application status
fly status

# Fly.io: view recent logs
fly logs

# Fly.io: open a console to the running instance
fly ssh console

# Fly.io: check recent releases
fly releases

# Test API health
curl -s https://api.properfy.com.br/health | jq .
curl -s https://api.properfy.com.br/ready | jq .

# Check metrics
curl -s https://api.properfy.com.br/metrics | jq .
```
