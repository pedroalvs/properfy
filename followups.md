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
