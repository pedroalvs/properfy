/*
  Drop `service_groups.group_size`.

  It was a denormalized counter written once at creation and never maintained:
  adding appointments to a group never incremented it, and unlinking them on
  cancel/reject never zeroed it. It drifted on 24 of 32 production groups. The
  size is now counted from the linked appointments on every read, so there is
  nothing to back-fill — the wrong values simply go away with the column.

  NOTE: `prisma migrate dev` also wanted to bundle a set of unrelated
  `rental_tenant_portal_*` constraint and index renames into this file. Those
  are pre-existing drift between schema.prisma and the applied chain, not part
  of this change, and have been trimmed out deliberately.
*/

-- AlterTable
ALTER TABLE "service_groups" DROP COLUMN "group_size";
