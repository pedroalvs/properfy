/*
  Drop `app_credentials.auth_code_encrypted`.

  These apps issue rotating / one-time authentication codes, so a code stored
  at registration time is stale by the time an inspector is on site. Keeping it
  bought nothing operationally and left one more secret under custody.

  `needs_auth_code` stays, demoted from a gate to a display-only flag: the
  inspector is told to expect a code prompt and obtains the code out of band.

  DATA LOSS IS INTENTIONAL. The values were AES-256-GCM ciphertext, so there is
  no practical recovery path and no back-fill — they simply go away with the
  column. This was an explicit product decision.

  NOTE: `prisma migrate dev` also wants to bundle a set of unrelated
  `rental_tenant_portal_*` constraint and index renames into this file. Those
  are pre-existing drift between schema.prisma and the applied chain, not part
  of this change, and are deliberately left out.
*/

-- AlterTable
ALTER TABLE "app_credentials" DROP COLUMN "auth_code_encrypted";
