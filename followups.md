# Follow-ups

Tracked work deferred out of a focused fix. Each item names the originating bug/PR.

## TOTP enrolment screen from login (from BUG-3)

**Context:** An account with a pending 2FA setup (`totpSetupRequired: true` on the
login response) receives only a `totp_setup`-stage token, which every protected
route rejects. Previously this authenticated the user and then silently bounced
them to `/login` with no feedback.

**Done in the BUG-3 fix (web UI/auth group):** the web app now refuses to store the
setup-stage token and shows a clear message on the login page
("Two-factor authentication setup is required before you can sign in…") instead of
the silent bounce.

**Still to build:** a real TOTP enrolment flow reachable from login, so a user with
`totpSetupRequired` can complete 2FA setup themselves instead of contacting an
administrator. The backend already allows `totp_setup`-stage tokens on the 2FA
setup/confirm endpoints (`allowTotpSetupStage: true`) and `SecuritySettingsPage`
already hosts a `TotpSetupCard`; the missing piece is surfacing an enrolment step
in the unauthenticated login journey (e.g. keep the staged token and route to a
dedicated setup screen) rather than dropping the session.

## Reconcile `specs/015` matrix vs CL_ADMIN deactivate (from BUG-6)

**Context:** The BUG-6 fix (PR #1212) widened OP to edit/deactivate agency users
cross-tenant, matching `specs/015`. While verifying, the reviewer found a
pre-existing discrepancy: `specs/015` line 95 lists **Deactivate user CL_ADMIN =
No**, but the code (before and after #1212) allows a CL_ADMIN to deactivate a user
in its own tenant (gated by `allowClientUserManagement`).

**Still to do:** decide whether the matrix or the code is authoritative for
CL_ADMIN deactivate (Update/Create list CL_ADMIN as Yes/Conditional, so the matrix
line is likely a typo) and align one to the other. Not introduced by #1212.

## Cover SMS in the platform-default reset re-adoption (from BUG-7)

**Context:** The BUG-7 fix (PR #1216) re-stamps `seeded_content_hash` and stores the
hand-written seed body when a reset platform default matches the catalog. The
catalog-match check compares `subject === catalog.subject`.

**Still to do:** for SMS platform defaults both subjects should be `null`, but if a
seed's `subject` is `undefined`, `null === undefined` is false and an SMS reset would
not re-adopt — a **safe false-negative** (degrades to pre-fix behaviour, never marks
a human edit as seed). The bug and tests target EMAIL; add SMS coverage / normalise
the subject comparison if SMS re-adoption is required.
