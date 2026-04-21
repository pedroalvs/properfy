/**
 * Idempotent QA user provisioner.
 *
 * Creates (or refreshes) the four role fixtures that every QA sweep of
 * the staging environment depends on:
 *
 *   - AM         admin@pedroalvs.com       tenant_id=null
 *   - OP         op@pedroalvs.com          tenant_id=null (cross-tenant per CLAUDE.md §6)
 *   - CL_ADMIN   cl.admin@pedroalvs.com    tenant=Sydney Property Services
 *   - CL_USER    cl.user@pedroalvs.com     tenant=Sydney Property Services
 *
 * Password is the shared `Admin@1234` used by the demo seed so QA credentials
 * stay stable across provisioning runs. Tenants and branches are created on
 * the fly if they don't exist — this script is safe to run against a fresh
 * database as well as an existing staging.
 *
 * Invocation:
 *
 *   Local / CI:
 *     pnpm --filter backend qa:provision-users
 *
 *   Staging (Fly.io):
 *     flyctl ssh console -a properfy \
 *       -C "sh -lc 'cd /app/apps/backend && pnpm qa:provision-users'"
 *
 * The script is also wired into `fly.staging.toml`'s `release_command`
 * chain so every staging deploy re-asserts the fixtures. Unlike the full
 * `prisma db seed`, this script never creates appointments, properties,
 * imports or financial records — it stays narrow so it's safe to run on
 * production-like data.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Admin@1234';

const FIXTURES = {
  tenant: {
    id: '8d39f531-0dd5-4a4f-af33-c470a1432cad',
    name: 'Sydney Property Services',
    legal_name: 'Sydney Property Services Pty Ltd',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
  },
  branch: {
    id: 'b81b9b49-b81b-9b49-b81b-9b49b81b9b49',
    name: 'QA City Office',
    contact_email: 'qa@sydneyproperty.com.au',
    address: { street: '1 George St', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
  },
  users: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@pedroalvs.com',
      name: 'Admin Master',
      role: 'AM' as const,
      tenantId: null,
      branchId: null,
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'op@pedroalvs.com',
      name: 'Sarah Operator',
      role: 'OP' as const,
      tenantId: null, // OP is cross-tenant per CLAUDE.md §6
      branchId: null,
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'cl.admin@pedroalvs.com',
      name: 'James Chen',
      role: 'CL_ADMIN' as const,
      tenantId: '8d39f531-0dd5-4a4f-af33-c470a1432cad',
      branchId: 'b81b9b49-b81b-9b49-b81b-9b49b81b9b49',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'cl.user@pedroalvs.com',
      name: 'Emily Park',
      role: 'CL_USER' as const,
      tenantId: '8d39f531-0dd5-4a4f-af33-c470a1432cad',
      branchId: 'b81b9b49-b81b-9b49-b81b-9b49b81b9b49',
    },
  ],
};

async function main() {
  console.log('Provisioning QA users...');

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Ensure the tenant exists. Match by legal_name first (unique) so we
  // don't collide with an existing tenant that has a different id.
  const existingTenant = await prisma.tenant.findFirst({
    where: { legal_name: FIXTURES.tenant.legal_name },
  });
  const tenantId = existingTenant?.id ?? FIXTURES.tenant.id;

  if (!existingTenant) {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: FIXTURES.tenant.name,
        legal_name: FIXTURES.tenant.legal_name,
        status: 'ACTIVE',
        timezone: FIXTURES.tenant.timezone,
        currency: FIXTURES.tenant.currency,
        settings_json: {},
      },
    });
    console.log(`  + tenant created: ${FIXTURES.tenant.name} (${tenantId})`);
  } else {
    console.log(`  = tenant exists:  ${existingTenant.name} (${tenantId})`);
  }

  // Ensure a branch exists for the client users. Pick the first active
  // branch of the tenant when one is available; otherwise create ours.
  let branch = await prisma.branch.findFirst({
    where: { tenant_id: tenantId, status: 'ACTIVE' },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        id: FIXTURES.branch.id,
        tenant_id: tenantId,
        name: FIXTURES.branch.name,
        contact_email: FIXTURES.branch.contact_email,
        address_json: FIXTURES.branch.address,
        status: 'ACTIVE',
      },
    });
    console.log(`  + branch created: ${branch.name} (${branch.id})`);
  } else {
    console.log(`  = branch exists:  ${branch.name} (${branch.id})`);
  }

  for (const fixture of FIXTURES.users) {
    const resolvedTenantId = fixture.tenantId ? tenantId : null;
    const resolvedBranchId = fixture.branchId ? branch.id : null;

    const existing = await prisma.user.findFirst({ where: { email: fixture.email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          tenant_id: resolvedTenantId,
          branch_id: resolvedBranchId,
          role: fixture.role,
          name: fixture.name,
          status: 'ACTIVE',
          password_hash: passwordHash,
          failed_login_count: 0,
          locked_until: null,
        },
      });
      console.log(`  = user refreshed: ${fixture.email} (${fixture.role})`);
    } else {
      await prisma.user.create({
        data: {
          id: fixture.id,
          email: fixture.email,
          name: fixture.name,
          role: fixture.role,
          tenant_id: resolvedTenantId,
          branch_id: resolvedBranchId,
          status: 'ACTIVE',
          password_hash: passwordHash,
          totp_enabled: false,
          failed_login_count: 0,
        },
      });
      console.log(`  + user created:   ${fixture.email} (${fixture.role})`);
    }
  }

  await provisionDefaultTemplates();

  console.log('\nQA credentials ready:');
  for (const u of FIXTURES.users) {
    console.log(`  ${u.email.padEnd(28)} → ${u.role.padEnd(9)} password: ${PASSWORD}`);
  }
}

/**
 * Ensure the platform-default notification templates that operational
 * flows depend on exist in staging/prod. Unlike `prisma db seed`, which
 * is only run locally, this script is part of the Fly.io release_command,
 * so idempotent upserts here guarantee the template catalog is never
 * empty in a fresh environment.
 *
 * Currently minimal: only the TENANT_PORTAL_LINK variants, because the
 * `GeneratePortalTokenUseCase` will otherwise enqueue notifications
 * against a missing templateCode — fire-and-forget inside the use case
 * swallows the failure but the tenant never receives the link. See
 * Bug B-5 follow-up.
 *
 * The full template catalog (reminders, confirmations, escalations,
 * report completion, etc.) is still owned by `prisma/seed.ts` for
 * local demo environments.
 */
async function provisionDefaultTemplates(): Promise<void> {
  const OP_EMAIL_FOOTER =
    ' If you no longer wish to receive operational notifications, you can unsubscribe here: {{unsubscribeUrl}}';
  const templates: Array<{
    code: string;
    channel: 'EMAIL' | 'SMS';
    subject: string | null;
    body: string;
  }> = [
    {
      code: 'TENANT_PORTAL_LINK',
      channel: 'EMAIL',
      subject: 'Your property inspection portal',
      body:
        'Dear {{tenantName}}, confirm, reschedule or update contact details for your inspection on ' +
        '{{scheduledDate}} using this secure link: {{portalToken}}.' +
        OP_EMAIL_FOOTER,
    },
    {
      code: 'TENANT_PORTAL_LINK',
      channel: 'SMS',
      subject: null,
      body: 'Properfy: inspection on {{scheduledDate}}. Manage it here: {{portalToken}}',
    },
  ];

  for (const t of templates) {
    const variables = (t.body.match(/\{\{(\w+)\}\}/g) ?? []).map((v: string) =>
      v.replace(/\{\{|\}\}/g, ''),
    );
    const existing = await prisma.notificationTemplate.findFirst({
      where: { tenant_id: null, template_code: t.code, channel: t.channel },
      select: { id: true },
    });
    if (existing) {
      await prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          subject: t.subject,
          body_text: t.body,
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
          variables_json: variables,
          is_active: true,
        },
      });
      console.log(`  = template refreshed: ${t.code} (${t.channel})`);
    } else {
      await prisma.notificationTemplate.create({
        data: {
          tenant_id: null,
          template_code: t.code,
          channel: t.channel,
          subject: t.subject,
          body_text: t.body,
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
          variables_json: variables,
          is_active: true,
        },
      });
      console.log(`  + template created:   ${t.code} (${t.channel})`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Failed to provision QA users:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
