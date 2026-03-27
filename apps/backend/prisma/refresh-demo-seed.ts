import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const prisma = new PrismaClient();

const DEMO_TENANT_LEGAL_NAMES = [
  'Sydney Property Services Pty Ltd',
  'Melbourne Real Estate Group Pty Ltd',
] as const;

const DEMO_USER_EMAILS = [
  'admin@pedroalvs.com',
  'op@pedroalvs.com',
  'cl.admin@pedroalvs.com',
  'cl.user@pedroalvs.com',
  'insp@pedroalvs.com',
  'inactive@pedroalvs.com',
  'locked@pedroalvs.com',
  'insp2@pedroalvs.com',
  'cl.admin2@pedroalvs.com',
] as const;

const DEMO_INSPECTOR_EMAILS = [
  'insp@pedroalvs.com',
  'carlos.mendez@inspectors.com.au',
  'insp2@pedroalvs.com',
  'retired@inspectors.com.au',
] as const;

async function optionalOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error?.code === 'P2021') {
      return fallback;
    }
    throw error;
  }
}

interface RefreshScope {
  tenantIds: string[];
  userIds: string[];
  inspectorIds: string[];
  appointmentIds: string[];
  executionIds: string[];
  portalTokenIds: string[];
}

async function collectScope(): Promise<RefreshScope> {
  const tenants = await prisma.tenant.findMany({
    where: { legal_name: { in: [...DEMO_TENANT_LEGAL_NAMES] } },
    select: { id: true },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);

  const users = await prisma.user.findMany({
    where: { email: { in: [...DEMO_USER_EMAILS] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  const inspectors = await prisma.inspector.findMany({
    where: {
      OR: [
        { email: { in: [...DEMO_INSPECTOR_EMAILS] } },
        { user_id: { in: userIds.length > 0 ? userIds : ['__none__'] } },
      ],
    },
    select: { id: true },
  });
  const inspectorIds = inspectors.map((inspector) => inspector.id);

  const appointments = await prisma.appointment.findMany({
    where: { tenant_id: { in: tenantIds.length > 0 ? tenantIds : ['__none__'] } },
    select: { id: true },
  });
  const appointmentIds = appointments.map((appointment) => appointment.id);

  const executions = await prisma.inspectionExecution.findMany({
    where: {
      OR: [
        { appointment_id: { in: appointmentIds.length > 0 ? appointmentIds : ['__none__'] } },
        { inspector_id: { in: inspectorIds.length > 0 ? inspectorIds : ['__none__'] } },
      ],
    },
    select: { id: true },
  });
  const executionIds = executions.map((execution) => execution.id);

  const portalTokens = await prisma.tenantPortalToken.findMany({
    where: { appointment_id: { in: appointmentIds.length > 0 ? appointmentIds : ['__none__'] } },
    select: { id: true },
  });
  const portalTokenIds = portalTokens.map((token) => token.id);

  return {
    tenantIds,
    userIds,
    inspectorIds,
    appointmentIds,
    executionIds,
    portalTokenIds,
  };
}

async function countPlannedDeletes(scope: RefreshScope) {
  const { tenantIds, userIds, inspectorIds, appointmentIds, executionIds, portalTokenIds } = scope;

  return {
    auditLogs: await prisma.auditLog.count({
      where: {
        OR: [
          { tenant_id: { in: tenantIds } },
          { actor_id: { in: userIds } },
          { entity_id: { in: [...appointmentIds, ...inspectorIds] } },
        ],
      },
    }),
    notifications: await prisma.notification.count({ where: { tenant_id: { in: tenantIds } } }),
    notificationTemplates: await prisma.notificationTemplate.count({ where: { tenant_id: { in: tenantIds } } }),
    portalActivities: await prisma.tenantPortalActivity.count({
      where: {
        OR: [
          { appointment_id: { in: appointmentIds } },
          { tenant_portal_token_id: { in: portalTokenIds } },
        ],
      },
    }),
    portalTokens: await prisma.tenantPortalToken.count({ where: { id: { in: portalTokenIds } } }),
    inspectionAssets: await prisma.inspectionAsset.count({
      where: {
        OR: [
          { appointment_id: { in: appointmentIds } },
          { inspection_execution_id: { in: executionIds } },
        ],
      },
    }),
    inspectionExecutions: await prisma.inspectionExecution.count({ where: { id: { in: executionIds } } }),
    appointmentContacts: await prisma.appointmentContact.count({ where: { appointment_id: { in: appointmentIds } } }),
    appointmentRestrictions: await prisma.appointmentRestriction.count({ where: { appointment_id: { in: appointmentIds } } }),
    financialEntries: await prisma.financialEntry.count({
      where: {
        OR: [
          { tenant_id: { in: tenantIds } },
          { appointment_id: { in: appointmentIds } },
          { inspector_id: { in: inspectorIds } },
        ],
      },
    }),
    reports: await prisma.report.count({
      where: {
        OR: [
          { tenant_id: { in: tenantIds } },
          { requested_by_user_id: { in: userIds } },
        ],
      },
    }),
    appointmentImports: await prisma.appointmentImport.count({ where: { tenant_id: { in: tenantIds } } }),
    propertyImports: await prisma.propertyImport.count({ where: { tenant_id: { in: tenantIds } } }),
    appointmentTimeSlots: await optionalOperation(
      () => prisma.appointmentTimeSlot.count({ where: { tenant_id: { in: tenantIds } } }),
      0,
    ),
    inspectorInvoices: await prisma.inspectorInvoice.count({ where: { inspector_id: { in: inspectorIds } } }),
    availabilitySlots: await prisma.inspectorAvailabilitySlot.count({ where: { inspector_id: { in: inspectorIds } } }),
    appointments: await prisma.appointment.count({ where: { id: { in: appointmentIds } } }),
    serviceGroups: await prisma.serviceGroup.count({ where: { tenant_id: { in: tenantIds } } }),
    properties: await prisma.property.count({ where: { tenant_id: { in: tenantIds } } }),
    pricingRules: await prisma.servicePriceRule.count({ where: { tenant_id: { in: tenantIds } } }),
    sessions: await prisma.session.count({ where: { user_id: { in: userIds } } }),
    inspectors: await prisma.inspector.count({ where: { id: { in: inspectorIds } } }),
    users: await prisma.user.count({ where: { id: { in: userIds } } }),
    branches: await prisma.branch.count({ where: { tenant_id: { in: tenantIds } } }),
    tenants: await prisma.tenant.count({ where: { id: { in: tenantIds } } }),
  };
}

async function executeRefresh(scope: RefreshScope) {
  const { tenantIds, userIds, inspectorIds, appointmentIds, executionIds, portalTokenIds } = scope;

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { tenant_id: { in: tenantIds } },
        { actor_id: { in: userIds } },
        { entity_id: { in: [...appointmentIds, ...inspectorIds] } },
      ],
    },
  });
  await prisma.notification.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.notificationTemplate.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.tenantPortalActivity.deleteMany({
    where: {
      OR: [
        { appointment_id: { in: appointmentIds } },
        { tenant_portal_token_id: { in: portalTokenIds } },
      ],
    },
  });
  await prisma.tenantPortalToken.deleteMany({ where: { id: { in: portalTokenIds } } });
  await prisma.inspectionAsset.deleteMany({
    where: {
      OR: [
        { appointment_id: { in: appointmentIds } },
        { inspection_execution_id: { in: executionIds } },
      ],
    },
  });
  await prisma.inspectionExecution.deleteMany({ where: { id: { in: executionIds } } });
  await prisma.appointmentContact.deleteMany({ where: { appointment_id: { in: appointmentIds } } });
  await prisma.appointmentRestriction.deleteMany({ where: { appointment_id: { in: appointmentIds } } });
  await prisma.financialEntry.deleteMany({
    where: {
      OR: [
        { tenant_id: { in: tenantIds } },
        { appointment_id: { in: appointmentIds } },
        { inspector_id: { in: inspectorIds } },
      ],
    },
  });
  await prisma.report.deleteMany({
    where: {
      OR: [
        { tenant_id: { in: tenantIds } },
        { requested_by_user_id: { in: userIds } },
      ],
    },
  });
  await prisma.appointmentImport.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.propertyImport.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await optionalOperation(
    () => prisma.appointmentTimeSlot.deleteMany({ where: { tenant_id: { in: tenantIds } } }),
    { count: 0 },
  );
  await prisma.inspectorInvoice.deleteMany({ where: { inspector_id: { in: inspectorIds } } });
  await prisma.inspectorAvailabilitySlot.deleteMany({ where: { inspector_id: { in: inspectorIds } } });
  await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  await prisma.serviceGroup.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.property.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.servicePriceRule.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.session.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.inspector.deleteMany({ where: { id: { in: inspectorIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function main() {
  const execute = process.argv.includes('--execute');
  const scope = await collectScope();
  const counts = await countPlannedDeletes(scope);

  console.log('Demo refresh scope');
  console.table({
    tenants: scope.tenantIds.length,
    users: scope.userIds.length,
    inspectors: scope.inspectorIds.length,
    appointments: scope.appointmentIds.length,
  });

  console.log('Planned deletes');
  console.table(counts);

  if (!execute) {
    console.log('\nDry run only. Re-run with --execute to delete demo data and reseed.');
    return;
  }

  if (scope.tenantIds.length === 0 && scope.userIds.length === 0 && scope.inspectorIds.length === 0) {
    console.log('No demo data found. Running seed only.');
  } else {
    console.log('\nDeleting existing demo data...');
    await executeRefresh(scope);
  }

  console.log('\nRe-seeding demo dataset...');
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('pnpm', ['prisma:seed'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
