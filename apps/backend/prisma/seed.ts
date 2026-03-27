import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const IDS = {
  // Tenants
  tenant: '10000000-0000-0000-0000-000000000001',
  tenant2: '10000000-0000-0000-0000-000000000002',
  // Branches
  branchCity: '20000000-0000-0000-0000-000000000001',
  branchNorth: '20000000-0000-0000-0000-000000000002',
  branchMelb: '20000000-0000-0000-0000-000000000003',
  branchInactive: '20000000-0000-0000-0000-000000000004',
  // Users
  userAM: '00000000-0000-0000-0000-000000000001',
  userOP: '00000000-0000-0000-0000-000000000002',
  userCLAdmin: '00000000-0000-0000-0000-000000000003',
  userCLUser: '00000000-0000-0000-0000-000000000004',
  userINSP: '00000000-0000-0000-0000-000000000005',
  userInactive: '00000000-0000-0000-0000-000000000006',
  userLocked: '00000000-0000-0000-0000-000000000007',
  userINSP2: '00000000-0000-0000-0000-000000000008',
  userCLAdmin2: '00000000-0000-0000-0000-000000000009',
  // Inspectors
  inspectorLinked: '30000000-0000-0000-0000-000000000001',
  inspectorIndep: '30000000-0000-0000-0000-000000000002',
  inspectorLinked2: '30000000-0000-0000-0000-000000000003',
  inspectorInactive: '30000000-0000-0000-0000-000000000004',
  // Service types
  stRoutine: '40000000-0000-0000-0000-000000000001',
  stIngoing: '40000000-0000-0000-0000-000000000002',
  stOutgoing: '40000000-0000-0000-0000-000000000003',
  // Pricing rules
  prRoutine: '50000000-0000-0000-0000-000000000001',
  prIngoing: '50000000-0000-0000-0000-000000000002',
  prOutgoing: '50000000-0000-0000-0000-000000000003',
  prRoutineNorth: '50000000-0000-0000-0000-000000000004',
  prRoutineT2: '50000000-0000-0000-0000-000000000005',
  // Properties (tenant1)
  prop1: '60000000-0000-0000-0000-000000000001',
  prop2: '60000000-0000-0000-0000-000000000002',
  prop3: '60000000-0000-0000-0000-000000000003',
  prop4: '60000000-0000-0000-0000-000000000004',
  prop5: '60000000-0000-0000-0000-000000000005',
  prop6: '60000000-0000-0000-0000-000000000006', // no geocoding (PENDING)
  prop7: '60000000-0000-0000-0000-000000000007', // geocoding FAILED
  // Properties (tenant2)
  prop8: '60000000-0000-0000-0000-000000000008',
  prop9: '60000000-0000-0000-0000-000000000009',
  prop10: '60000000-0000-0000-0000-000000000010',
  // Appointments (tenant1)
  apptDraft: '70000000-0000-0000-0000-000000000001',
  apptAwaiting: '70000000-0000-0000-0000-000000000002',
  apptScheduled: '70000000-0000-0000-0000-000000000003',
  apptDone: '70000000-0000-0000-0000-000000000004',
  apptCancelled: '70000000-0000-0000-0000-000000000005',
  apptRejected: '70000000-0000-0000-0000-000000000006',
  apptScheduled2: '70000000-0000-0000-0000-000000000007',
  apptDone2: '70000000-0000-0000-0000-000000000008',
  apptCancelled2: '70000000-0000-0000-0000-000000000009',
  apptAwaiting2: '70000000-0000-0000-0000-000000000010',
  // Appointments (tenant2)
  apptDraftT2: '70000000-0000-0000-0000-000000000011',
  apptScheduledT2: '70000000-0000-0000-0000-000000000012',
  apptDoneT2: '70000000-0000-0000-0000-000000000013',
  apptCancelledT2: '70000000-0000-0000-0000-000000000014',
  // Service groups
  serviceGroup: '80000000-0000-0000-0000-000000000001',
  sgDraft: '80000000-0000-0000-0000-000000000002',
  sgAccepted: '80000000-0000-0000-0000-000000000003',
  sgCancelled: '80000000-0000-0000-0000-000000000004',
  // Availability slots
  slot1: '0a000000-0000-0000-0000-000000000001',
  slot2: '0a000000-0000-0000-0000-000000000002',
  slot3: '0a000000-0000-0000-0000-000000000003',
  slot4: '0a000000-0000-0000-0000-000000000004',
  slot5: '0a000000-0000-0000-0000-000000000005',
  // Financial entries
  fe1: '0b000000-0000-0000-0000-000000000001',
  fe2: '0b000000-0000-0000-0000-000000000002',
  fe3: '0b000000-0000-0000-0000-000000000003',
  fe4: '0b000000-0000-0000-0000-000000000004',
  fe5: '0b000000-0000-0000-0000-000000000005',
  fe6: '0b000000-0000-0000-0000-000000000006',
  fe7: '0b000000-0000-0000-0000-000000000007',
  fe8: '0b000000-0000-0000-0000-000000000008',
  fe9: '0b000000-0000-0000-0000-000000000009',
  // Inspector invoices
  inv1: '0c000000-0000-0000-0000-000000000001',
  inv2: '0c000000-0000-0000-0000-000000000002',
  inv3: '0c000000-0000-0000-0000-000000000003',
  // Inspection executions
  exec1: '0d000000-0000-0000-0000-000000000001',
  exec2: '0d000000-0000-0000-0000-000000000002',
  exec3: '0d000000-0000-0000-0000-000000000003',
  // Inspection assets
  asset1: '0e000000-0000-0000-0000-000000000001',
  asset2: '0e000000-0000-0000-0000-000000000002',
  asset3: '0e000000-0000-0000-0000-000000000003',
  asset4: '0e000000-0000-0000-0000-000000000004',
  // Notifications
  notif1: '0f000000-0000-0000-0000-000000000001',
  notif2: '0f000000-0000-0000-0000-000000000002',
  notif3: '0f000000-0000-0000-0000-000000000003',
  notif4: '0f000000-0000-0000-0000-000000000004',
  notif5: '0f000000-0000-0000-0000-000000000005',
  notif6: '0f000000-0000-0000-0000-000000000006',
  // Portal tokens
  pt1: '1a000000-0000-0000-0000-000000000001',
  pt2: '1a000000-0000-0000-0000-000000000002',
  pt3: '1a000000-0000-0000-0000-000000000003',
  // Portal activities
  pa1: '1b000000-0000-0000-0000-000000000001',
  pa2: '1b000000-0000-0000-0000-000000000002',
  pa3: '1b000000-0000-0000-0000-000000000003',
  // Reports
  rpt1: '1c000000-0000-0000-0000-000000000001',
  rpt2: '1c000000-0000-0000-0000-000000000002',
  rpt3: '1c000000-0000-0000-0000-000000000003',
  rpt4: '1c000000-0000-0000-0000-000000000004',
  // Restrictions
  restr1: '1d000000-0000-0000-0000-000000000001',
  restr2: '1d000000-0000-0000-0000-000000000002',
  // Imports
  apptImport1: '1e000000-0000-0000-0000-000000000001',
  apptImport2: '1e000000-0000-0000-0000-000000000002',
  propImport1: '1f000000-0000-0000-0000-000000000001',
  propImport2: '1f000000-0000-0000-0000-000000000002',
} as const;

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  const today = new Date();
  const futureDate = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const pastDate = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // ─── TENANTS ──────────────────────────────────────────────────────────────

  const tenant = await prisma.tenant.upsert({
    where: { legal_name: 'Sydney Property Services Pty Ltd' },
    update: {},
    create: {
      id: IDS.tenant,
      name: 'Sydney Property Services',
      legal_name: 'Sydney Property Services Pty Ltd',
      status: 'ACTIVE',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
    },
  });

  await prisma.tenant.upsert({
    where: { legal_name: 'Melbourne Real Estate Group Pty Ltd' },
    update: {},
    create: {
      id: IDS.tenant2,
      name: 'Melbourne Real Estate',
      legal_name: 'Melbourne Real Estate Group Pty Ltd',
      status: 'ACTIVE',
      timezone: 'Australia/Melbourne',
      currency: 'AUD',
    },
  });
  console.log('Tenants: 2 created');

  // ─── BRANCHES ─────────────────────────────────────────────────────────────

  const branchCity = await prisma.branch.upsert({
    where: { tenant_id_name: { tenant_id: IDS.tenant, name: 'City Office' } },
    update: {},
    create: {
      id: IDS.branchCity,
      tenant_id: IDS.tenant,
      name: 'City Office',
      contact_email: 'city@sydneypropservices.com.au',
      address_json: { street: '100 George St', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
    },
  });

  const branchNorth = await prisma.branch.upsert({
    where: { tenant_id_name: { tenant_id: IDS.tenant, name: 'North Shore Office' } },
    update: {},
    create: {
      id: IDS.branchNorth,
      tenant_id: IDS.tenant,
      name: 'North Shore Office',
      contact_email: 'northshore@sydneypropservices.com.au',
      address_json: { street: '45 Pacific Hwy', suburb: 'North Sydney', state: 'NSW', postcode: '2060' },
    },
  });

  await prisma.branch.upsert({
    where: { tenant_id_name: { tenant_id: IDS.tenant, name: 'Inactive Branch' } },
    update: {},
    create: {
      id: IDS.branchInactive,
      tenant_id: IDS.tenant,
      name: 'Inactive Branch',
      contact_email: 'closed@sydneypropservices.com.au',
      status: 'INACTIVE',
    },
  });

  await prisma.branch.upsert({
    where: { tenant_id_name: { tenant_id: IDS.tenant2, name: 'Melbourne CBD Office' } },
    update: {},
    create: {
      id: IDS.branchMelb,
      tenant_id: IDS.tenant2,
      name: 'Melbourne CBD Office',
      contact_email: 'cbd@melbournerealestate.com.au',
      address_json: { street: '200 Collins St', suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
    },
  });
  console.log(`Branches: ${branchCity.name}, ${branchNorth.name} + inactive + Melbourne`);

  // ─── USERS ────────────────────────────────────────────────────────────────

  const usersToCreate = [
    { id: IDS.userAM, tenant_id: null, branch_id: null, role: 'AM' as const, name: 'Admin Master', email: 'admin@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userOP, tenant_id: null, branch_id: null, role: 'OP' as const, name: 'Sarah Operator', email: 'op@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userCLAdmin, tenant_id: IDS.tenant, branch_id: IDS.branchCity, role: 'CL_ADMIN' as const, name: 'James Chen', email: 'cl.admin@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userCLUser, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, role: 'CL_USER' as const, name: 'Emily Park', email: 'cl.user@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userINSP, tenant_id: null, branch_id: null, role: 'INSP' as const, name: 'Mike Inspector', email: 'insp@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userInactive, tenant_id: IDS.tenant, branch_id: IDS.branchCity, role: 'CL_USER' as const, name: 'Deactivated User', email: 'inactive@pedroalvs.com', status: 'INACTIVE' as const },
    { id: IDS.userLocked, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, role: 'CL_USER' as const, name: 'Locked User', email: 'locked@pedroalvs.com', status: 'LOCKED' as const },
    { id: IDS.userINSP2, tenant_id: null, branch_id: null, role: 'INSP' as const, name: 'Lisa Wong', email: 'insp2@pedroalvs.com', status: 'ACTIVE' as const },
    { id: IDS.userCLAdmin2, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb, role: 'CL_ADMIN' as const, name: 'Robert Turner', email: 'cl.admin2@pedroalvs.com', status: 'ACTIVE' as const },
  ];

  for (const u of usersToCreate) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email },
      create: {
        id: u.id,
        tenant_id: u.tenant_id,
        branch_id: u.branch_id,
        role: u.role,
        name: u.name,
        email: u.email,
        status: u.status,
        password_hash: passwordHash,
        totp_enabled: false,
        failed_login_count: u.status === 'LOCKED' ? 5 : 0,
      },
    });
  }
  console.log(`Users: ${usersToCreate.length} created`);

  // ─── INSPECTORS ───────────────────────────────────────────────────────────

  await prisma.inspector.upsert({
    where: { id: IDS.inspectorLinked },
    update: {},
    create: {
      id: IDS.inspectorLinked,
      user_id: IDS.userINSP,
      name: 'Mike Inspector',
      email: 'insp@pedroalvs.com',
      phone: '+61400111222',
      status: 'ACTIVE',
      regions_json: ['Sydney CBD', 'North Shore', 'Inner West'],
      service_types_json: [IDS.stRoutine, IDS.stIngoing],
    },
  });

  await prisma.inspector.upsert({
    where: { id: IDS.inspectorIndep },
    update: {},
    create: {
      id: IDS.inspectorIndep,
      name: 'Carlos Mendez',
      email: 'carlos.mendez@inspectors.com.au',
      phone: '+61400333444',
      status: 'ACTIVE',
      regions_json: ['Eastern Suburbs', 'South Sydney'],
      service_types_json: [IDS.stRoutine, IDS.stOutgoing],
    },
  });

  await prisma.inspector.upsert({
    where: { id: IDS.inspectorLinked2 },
    update: {},
    create: {
      id: IDS.inspectorLinked2,
      user_id: IDS.userINSP2,
      name: 'Lisa Wong',
      email: 'insp2@pedroalvs.com',
      phone: '+61400555666',
      status: 'ACTIVE',
      regions_json: ['Melbourne CBD', 'Southbank', 'Richmond'],
      service_types_json: [IDS.stRoutine, IDS.stIngoing, IDS.stOutgoing],
    },
  });

  await prisma.inspector.upsert({
    where: { id: IDS.inspectorInactive },
    update: {},
    create: {
      id: IDS.inspectorInactive,
      name: 'Tom Retired',
      email: 'retired@inspectors.com.au',
      phone: '+61400777888',
      status: 'INACTIVE',
      regions_json: ['Parramatta', 'Western Sydney'],
    },
  });
  console.log('Inspectors: 4 created (2 active linked, 1 active independent, 1 inactive)');

  // ─── SERVICE TYPES ────────────────────────────────────────────────────────

  const serviceTypes = [
    { id: IDS.stRoutine, code: 'ROUTINE', name: 'Routine Inspection', flow_type: 'ROUTINE' as const, requires_tenant_confirmation: true },
    { id: IDS.stIngoing, code: 'INGOING', name: 'Ingoing Inspection', flow_type: 'INGOING' as const, requires_tenant_confirmation: false },
    { id: IDS.stOutgoing, code: 'OUTGOING', name: 'Outgoing Inspection', flow_type: 'OUTGOING' as const, requires_tenant_confirmation: false },
  ];

  for (const st of serviceTypes) {
    await prisma.serviceType.upsert({
      where: { code: st.code },
      update: {},
      create: st,
    });
  }
  console.log('Service types: 3 created');

  // ─── PRICING RULES ────────────────────────────────────────────────────────

  const pricingRules = [
    { id: IDS.prRoutine, tenant_id: IDS.tenant, service_type_id: IDS.stRoutine, branch_id: IDS.branchCity, price_amount: 150.00, payout_type: 'FIXED' as const, payout_value: 80.00 },
    { id: IDS.prIngoing, tenant_id: IDS.tenant, service_type_id: IDS.stIngoing, branch_id: IDS.branchCity, price_amount: 220.00, payout_type: 'FIXED' as const, payout_value: 120.00 },
    { id: IDS.prOutgoing, tenant_id: IDS.tenant, service_type_id: IDS.stOutgoing, branch_id: IDS.branchCity, price_amount: 180.00, payout_type: 'FIXED' as const, payout_value: 100.00 },
    { id: IDS.prRoutineNorth, tenant_id: IDS.tenant, service_type_id: IDS.stRoutine, branch_id: IDS.branchNorth, price_amount: 160.00, payout_type: 'PERCENTAGE' as const, payout_value: 55.00 },
    { id: IDS.prRoutineT2, tenant_id: IDS.tenant2, service_type_id: IDS.stRoutine, branch_id: IDS.branchMelb, price_amount: 140.00, payout_type: 'FIXED' as const, payout_value: 75.00 },
  ];

  for (const pr of pricingRules) {
    await prisma.servicePriceRule.upsert({
      where: { tenant_id_service_type_id_branch_id: { tenant_id: pr.tenant_id, service_type_id: pr.service_type_id, branch_id: pr.branch_id! } },
      update: {},
      create: pr,
    });
  }
  console.log('Pricing rules: 5 created');

  // ─── PROPERTIES ───────────────────────────────────────────────────────────

  const properties = [
    // Tenant 1 — geocoded
    { id: IDS.prop1, tenant_id: IDS.tenant, branch_id: IDS.branchCity, property_code: 'SPS-001', type: 'RESIDENTIAL' as const, street: '12 Harbour St', suburb: 'Sydney', postcode: '2000', state: 'NSW', lat: -33.8688, lng: 151.2093, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop2, tenant_id: IDS.tenant, branch_id: IDS.branchCity, property_code: 'SPS-002', type: 'RESIDENTIAL' as const, street: '88 Crown St', suburb: 'Surry Hills', postcode: '2010', state: 'NSW', lat: -33.8838, lng: 151.2122, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop3, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, property_code: 'SPS-003', type: 'RESIDENTIAL' as const, street: '5 Blue St', suburb: 'North Sydney', postcode: '2060', state: 'NSW', lat: -33.8389, lng: 151.2074, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop4, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, property_code: 'SPS-004', type: 'COMMERCIAL' as const, street: '200 Pacific Hwy', suburb: 'Crows Nest', postcode: '2065', state: 'NSW', lat: -33.8268, lng: 151.2022, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop5, tenant_id: IDS.tenant, branch_id: IDS.branchCity, property_code: 'SPS-005', type: 'RESIDENTIAL' as const, street: '33 Glebe Point Rd', suburb: 'Glebe', postcode: '2037', state: 'NSW', lat: -33.8785, lng: 151.1867, geocoding_status: 'SUCCESS' as const },
    // Tenant 1 — no geocoding
    { id: IDS.prop6, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, property_code: 'SPS-006', type: 'RESIDENTIAL' as const, street: '14 Miller St', suburb: 'Chatswood', postcode: '2067', state: 'NSW', lat: null, lng: null, geocoding_status: 'PENDING' as const },
    { id: IDS.prop7, tenant_id: IDS.tenant, branch_id: IDS.branchCity, property_code: 'SPS-007', type: 'INDUSTRIAL' as const, street: '9 Bourke Rd', suburb: 'Alexandria', postcode: '2015', state: 'NSW', lat: null, lng: null, geocoding_status: 'FAILED' as const },
    // Tenant 2
    { id: IDS.prop8, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb, property_code: 'MRE-001', type: 'RESIDENTIAL' as const, street: '12 Swanston St', suburb: 'Melbourne', postcode: '3000', state: 'VIC', lat: -37.8136, lng: 144.9631, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop9, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb, property_code: 'MRE-002', type: 'RESIDENTIAL' as const, street: '5 Church St', suburb: 'Richmond', postcode: '3121', state: 'VIC', lat: -37.8183, lng: 144.9971, geocoding_status: 'SUCCESS' as const },
    { id: IDS.prop10, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb, property_code: 'MRE-003', type: 'COMMERCIAL' as const, street: '100 St Kilda Rd', suburb: 'Southbank', postcode: '3006', state: 'VIC', lat: -37.8305, lng: 144.9675, geocoding_status: 'SUCCESS' as const },
  ];

  for (const p of properties) {
    await prisma.property.upsert({
      where: { tenant_id_property_code: { tenant_id: p.tenant_id, property_code: p.property_code } },
      update: {},
      create: {
        id: p.id,
        tenant_id: p.tenant_id,
        branch_id: p.branch_id,
        property_code: p.property_code,
        type: p.type,
        street: p.street,
        suburb: p.suburb,
        postcode: p.postcode,
        state: p.state,
        country: 'AU',
        lat: p.lat,
        lng: p.lng,
        geocoding_status: p.geocoding_status,
      },
    });
  }
  console.log(`Properties: ${properties.length} created (geocoded + pending + failed + tenant2)`);

  // ─── APPOINTMENTS ─────────────────────────────────────────────────────────

  const pricingSnapshotRoutine = { price_amount: 150, payout_value: 80, payout_type: 'FIXED', service_type: 'ROUTINE' };
  const pricingSnapshotIngoing = { price_amount: 220, payout_value: 120, payout_type: 'FIXED', service_type: 'INGOING' };
  const pricingSnapshotOutgoing = { price_amount: 180, payout_value: 100, payout_type: 'FIXED', service_type: 'OUTGOING' };
  const pricingSnapshotT2 = { price_amount: 140, payout_value: 75, payout_type: 'FIXED', service_type: 'ROUTINE' };

  // Tenant 1 appointments
  const appointments = [
    {
      id: IDS.apptDraft, tenant_id: IDS.tenant, branch_id: IDS.branchCity,
      property_id: IDS.prop1, service_type_id: IDS.stRoutine, inspector_id: null,
      status: 'DRAFT' as const, scheduled_date: futureDate(14), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 150.00, payout_amount: 80.00, pricing_rule_snapshot_json: pricingSnapshotRoutine,
      created_by_user_id: IDS.userCLAdmin, reason: null,
    },
    {
      id: IDS.apptAwaiting, tenant_id: IDS.tenant, branch_id: IDS.branchCity,
      property_id: IDS.prop2, service_type_id: IDS.stRoutine, inspector_id: null,
      status: 'AWAITING_INSPECTOR' as const, scheduled_date: futureDate(10), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 150.00, payout_amount: 80.00, pricing_rule_snapshot_json: pricingSnapshotRoutine,
      created_by_user_id: IDS.userOP, reason: null,
    },
    {
      id: IDS.apptScheduled, tenant_id: IDS.tenant, branch_id: IDS.branchNorth,
      property_id: IDS.prop3, service_type_id: IDS.stIngoing, inspector_id: IDS.inspectorLinked,
      status: 'SCHEDULED' as const, scheduled_date: futureDate(7), time_slot: '13:00-16:00',
      tenant_confirmation_status: 'CONFIRMED' as const,
      price_amount: 220.00, payout_amount: 120.00, pricing_rule_snapshot_json: pricingSnapshotIngoing,
      created_by_user_id: IDS.userOP, reason: null,
    },
    {
      id: IDS.apptDone, tenant_id: IDS.tenant, branch_id: IDS.branchNorth,
      property_id: IDS.prop4, service_type_id: IDS.stRoutine, inspector_id: IDS.inspectorLinked,
      status: 'DONE' as const, scheduled_date: pastDate(3), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'CONFIRMED' as const,
      price_amount: 150.00, payout_amount: 80.00, pricing_rule_snapshot_json: pricingSnapshotRoutine,
      created_by_user_id: IDS.userCLAdmin,
      done_checked_by_user_id: IDS.userOP, done_checked_at: pastDate(2), reason: null,
    },
    {
      id: IDS.apptCancelled, tenant_id: IDS.tenant, branch_id: IDS.branchCity,
      property_id: IDS.prop5, service_type_id: IDS.stOutgoing, inspector_id: null,
      status: 'CANCELLED' as const, scheduled_date: pastDate(1), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 180.00, payout_amount: 100.00, pricing_rule_snapshot_json: pricingSnapshotOutgoing,
      created_by_user_id: IDS.userCLAdmin,
      reason: 'Tenant relocated early, inspection no longer needed',
      cancellation_reason_code: 'TENANT_REQUEST',
    },
    {
      id: IDS.apptRejected, tenant_id: IDS.tenant, branch_id: IDS.branchCity,
      property_id: IDS.prop6, service_type_id: IDS.stRoutine, inspector_id: null,
      status: 'REJECTED' as const, scheduled_date: pastDate(5), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'UNAVAILABLE' as const,
      price_amount: 150.00, payout_amount: 80.00, pricing_rule_snapshot_json: pricingSnapshotRoutine,
      created_by_user_id: IDS.userOP,
      reason: 'Property address does not exist, impossible to execute',
      rejection_reason_code: 'WRONG_ADDRESS',
    },
    {
      id: IDS.apptScheduled2, tenant_id: IDS.tenant, branch_id: IDS.branchCity,
      property_id: IDS.prop2, service_type_id: IDS.stRoutine, inspector_id: IDS.inspectorIndep,
      status: 'SCHEDULED' as const, scheduled_date: futureDate(5), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'CONFIRMED' as const,
      price_amount: 150.00, payout_amount: 80.00, pricing_rule_snapshot_json: pricingSnapshotRoutine,
      created_by_user_id: IDS.userOP, reason: null,
    },
    {
      id: IDS.apptDone2, tenant_id: IDS.tenant, branch_id: IDS.branchNorth,
      property_id: IDS.prop3, service_type_id: IDS.stRoutine, inspector_id: IDS.inspectorIndep,
      status: 'DONE' as const, scheduled_date: pastDate(7), time_slot: '13:00-16:00',
      tenant_confirmation_status: 'NO_RESPONSE' as const,
      price_amount: 160.00, payout_amount: 88.00, pricing_rule_snapshot_json: { ...pricingSnapshotRoutine, price_amount: 160, payout_value: 88 },
      created_by_user_id: IDS.userCLAdmin,
      done_checked_by_user_id: IDS.userAM, done_checked_at: pastDate(6), reason: null,
    },
    {
      id: IDS.apptCancelled2, tenant_id: IDS.tenant, branch_id: IDS.branchNorth,
      property_id: IDS.prop3, service_type_id: IDS.stIngoing, inspector_id: IDS.inspectorLinked,
      status: 'CANCELLED' as const, scheduled_date: pastDate(2), time_slot: '10:00-13:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 220.00, payout_amount: 120.00, pricing_rule_snapshot_json: pricingSnapshotIngoing,
      created_by_user_id: IDS.userOP,
      reason: 'Inspector unavailable on the day',
      cancellation_reason_code: 'INSPECTOR_UNAVAILABLE',
    },
    {
      id: IDS.apptAwaiting2, tenant_id: IDS.tenant, branch_id: IDS.branchNorth,
      property_id: IDS.prop4, service_type_id: IDS.stRoutine, inspector_id: null,
      status: 'AWAITING_INSPECTOR' as const, scheduled_date: futureDate(12), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 160.00, payout_amount: 88.00, pricing_rule_snapshot_json: { ...pricingSnapshotRoutine, price_amount: 160, payout_value: 88 },
      created_by_user_id: IDS.userOP, reason: null,
    },
    // Tenant 2 appointments
    {
      id: IDS.apptDraftT2, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb,
      property_id: IDS.prop8, service_type_id: IDS.stRoutine, inspector_id: null,
      status: 'DRAFT' as const, scheduled_date: futureDate(20), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 140.00, payout_amount: 75.00, pricing_rule_snapshot_json: pricingSnapshotT2,
      created_by_user_id: IDS.userCLAdmin2, reason: null,
    },
    {
      id: IDS.apptScheduledT2, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb,
      property_id: IDS.prop9, service_type_id: IDS.stRoutine, inspector_id: IDS.inspectorLinked2,
      status: 'SCHEDULED' as const, scheduled_date: futureDate(8), time_slot: '10:00-13:00',
      tenant_confirmation_status: 'CONFIRMED' as const,
      price_amount: 140.00, payout_amount: 75.00, pricing_rule_snapshot_json: pricingSnapshotT2,
      created_by_user_id: IDS.userCLAdmin2, reason: null,
    },
    {
      id: IDS.apptDoneT2, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb,
      property_id: IDS.prop10, service_type_id: IDS.stRoutine, inspector_id: IDS.inspectorLinked2,
      status: 'DONE' as const, scheduled_date: pastDate(4), time_slot: '09:00-12:00',
      tenant_confirmation_status: 'CONFIRMED' as const,
      price_amount: 140.00, payout_amount: 75.00, pricing_rule_snapshot_json: pricingSnapshotT2,
      created_by_user_id: IDS.userCLAdmin2,
      done_checked_by_user_id: IDS.userOP, done_checked_at: pastDate(3), reason: null,
    },
    {
      id: IDS.apptCancelledT2, tenant_id: IDS.tenant2, branch_id: IDS.branchMelb,
      property_id: IDS.prop8, service_type_id: IDS.stIngoing, inspector_id: null,
      status: 'CANCELLED' as const, scheduled_date: pastDate(10), time_slot: '14:00-17:00',
      tenant_confirmation_status: 'PENDING' as const,
      price_amount: 220.00, payout_amount: 120.00, pricing_rule_snapshot_json: pricingSnapshotIngoing,
      created_by_user_id: IDS.userCLAdmin2,
      reason: 'Client requested cancellation',
      cancellation_reason_code: 'CLIENT_REQUEST',
    },
  ];

  for (const a of appointments) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        tenant_id: a.tenant_id,
        branch_id: a.branch_id,
        property_id: a.property_id,
        service_type_id: a.service_type_id,
        inspector_id: a.inspector_id,
        status: a.status,
        scheduled_date: a.scheduled_date,
        time_slot: a.time_slot,
        tenant_confirmation_status: a.tenant_confirmation_status,
        price_amount: a.price_amount,
        payout_amount: a.payout_amount,
        pricing_rule_snapshot_json: a.pricing_rule_snapshot_json,
        created_by_user_id: a.created_by_user_id,
        done_checked_by_user_id: (a as any).done_checked_by_user_id ?? null,
        done_checked_at: (a as any).done_checked_at ?? null,
        reason: (a as any).reason ?? null,
        cancellation_reason_code: (a as any).cancellation_reason_code ?? null,
        rejection_reason_code: (a as any).rejection_reason_code ?? null,
      },
    });
  }
  console.log(`Appointments: ${appointments.length} created (all statuses, 2 tenants)`);

  // ─── APPOINTMENT CONTACTS ─────────────────────────────────────────────────

  const contacts = [
    { appointment_id: IDS.apptDraft, tenant_name: 'John Smith', primary_email: 'john.smith@gmail.com', primary_phone: '+61400555001' },
    { appointment_id: IDS.apptAwaiting, tenant_name: 'Maria Garcia', primary_email: 'maria.garcia@gmail.com', primary_phone: '+61400555002' },
    { appointment_id: IDS.apptScheduled, tenant_name: 'David Lee', primary_email: 'david.lee@gmail.com', primary_phone: '+61400555003' },
    { appointment_id: IDS.apptDone, tenant_name: 'Sophie Brown', primary_email: 'sophie.brown@gmail.com', primary_phone: '+61400555004' },
    { appointment_id: IDS.apptCancelled, tenant_name: 'Alex Kim', primary_email: 'alex.kim@gmail.com', primary_phone: '+61400555005' },
    { appointment_id: IDS.apptRejected, tenant_name: 'Tony Nguyen', primary_email: 'tony.nguyen@gmail.com', primary_phone: '+61400555006' },
    { appointment_id: IDS.apptScheduled2, tenant_name: 'Rachel White', primary_email: 'rachel.white@gmail.com', primary_phone: '+61400555007' },
    { appointment_id: IDS.apptDone2, tenant_name: 'Oliver Chen', primary_email: 'oliver.chen@gmail.com', primary_phone: '+61400555008' },
    { appointment_id: IDS.apptCancelled2, tenant_name: 'Priya Patel', primary_email: 'priya.patel@gmail.com', primary_phone: '+61400555009' },
    { appointment_id: IDS.apptAwaiting2, tenant_name: 'James Wilson', primary_email: 'james.wilson@gmail.com', primary_phone: '+61400555010' },
    { appointment_id: IDS.apptDraftT2, tenant_name: 'Anne Clarke', primary_email: 'anne.clarke@gmail.com', primary_phone: '+61400666001' },
    { appointment_id: IDS.apptScheduledT2, tenant_name: 'Ben Rogers', primary_email: 'ben.rogers@gmail.com', primary_phone: '+61400666002' },
    { appointment_id: IDS.apptDoneT2, tenant_name: 'Cathy Evans', primary_email: 'cathy.evans@gmail.com', primary_phone: '+61400666003' },
    { appointment_id: IDS.apptCancelledT2, tenant_name: 'Dan Morrison', primary_email: 'dan.morrison@gmail.com', primary_phone: '+61400666004' },
  ];

  for (const c of contacts) {
    await prisma.appointmentContact.upsert({
      where: { appointment_id: c.appointment_id },
      update: {},
      create: c,
    });
  }
  console.log(`Contacts: ${contacts.length} created`);

  // ─── SERVICE GROUPS ───────────────────────────────────────────────────────

  await prisma.serviceGroup.upsert({
    where: { id: IDS.serviceGroup },
    update: {},
    create: {
      id: IDS.serviceGroup,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stRoutine,
      status: 'PUBLISHED',
      group_size: 3,
      offered_count: 0,
      confirmed_count: 0,
      scheduled_date: futureDate(10),
      time_window: '09:00-17:00',
      published_at: new Date(),
      created_by_user_id: IDS.userOP,
    },
  });

  await prisma.serviceGroup.upsert({
    where: { id: IDS.sgDraft },
    update: {},
    create: {
      id: IDS.sgDraft,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stIngoing,
      status: 'DRAFT',
      group_size: 2,
      offered_count: 0,
      confirmed_count: 0,
      scheduled_date: futureDate(20),
      time_window: '08:00-16:00',
      created_by_user_id: IDS.userOP,
    },
  });

  await prisma.serviceGroup.upsert({
    where: { id: IDS.sgAccepted },
    update: {},
    create: {
      id: IDS.sgAccepted,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stRoutine,
      status: 'ACCEPTED',
      group_size: 2,
      offered_count: 1,
      confirmed_count: 1,
      scheduled_date: futureDate(5),
      time_window: '09:00-17:00',
      assigned_inspector_id: IDS.inspectorIndep,
      published_at: pastDate(2),
      assigned_at: pastDate(1),
      created_by_user_id: IDS.userOP,
    },
  });

  await prisma.serviceGroup.upsert({
    where: { id: IDS.sgCancelled },
    update: {},
    create: {
      id: IDS.sgCancelled,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stRoutine,
      status: 'CANCELLED',
      group_size: 2,
      offered_count: 0,
      confirmed_count: 0,
      scheduled_date: pastDate(2),
      time_window: '09:00-17:00',
      published_at: pastDate(5),
      created_by_user_id: IDS.userOP,
    },
  });
  console.log('Service groups: 4 created (PUBLISHED, DRAFT, ACCEPTED, CANCELLED)');

  // Link appointments to service groups
  await prisma.appointment.update({ where: { id: IDS.apptAwaiting }, data: { service_group_id: IDS.serviceGroup } });
  await prisma.appointment.update({ where: { id: IDS.apptDraft }, data: { service_group_id: IDS.serviceGroup } });
  await prisma.appointment.update({ where: { id: IDS.apptAwaiting2 }, data: { service_group_id: IDS.sgDraft } });
  await prisma.appointment.update({ where: { id: IDS.apptScheduled2 }, data: { service_group_id: IDS.sgAccepted } });
  await prisma.appointment.update({ where: { id: IDS.apptDone2 }, data: { service_group_id: IDS.sgAccepted } });
  await prisma.appointment.update({ where: { id: IDS.apptCancelled2 }, data: { service_group_id: IDS.sgCancelled } });

  // ─── AVAILABILITY SLOTS ───────────────────────────────────────────────────

  const slots = [
    { id: IDS.slot1, inspector_id: IDS.inspectorLinked, date: futureDate(5), start_time: '08:00', end_time: '12:00', status: 'AVAILABLE' as const, region_json: { name: 'Sydney CBD' }, capacity: 3 },
    { id: IDS.slot2, inspector_id: IDS.inspectorLinked, date: futureDate(7), start_time: '13:00', end_time: '17:00', status: 'AVAILABLE' as const, region_json: { name: 'North Shore' }, capacity: 2 },
    { id: IDS.slot3, inspector_id: IDS.inspectorLinked, date: futureDate(7), start_time: '08:00', end_time: '12:00', status: 'BOOKED' as const, region_json: { name: 'Inner West' }, capacity: 1 },
    { id: IDS.slot4, inspector_id: IDS.inspectorIndep, date: futureDate(3), start_time: '09:00', end_time: '13:00', status: 'CANCELLED' as const, region_json: { name: 'Eastern Suburbs' }, capacity: 2 },
    { id: IDS.slot5, inspector_id: IDS.inspectorLinked2, date: futureDate(8), start_time: '08:00', end_time: '16:00', status: 'AVAILABLE' as const, region_json: { name: 'Melbourne CBD' }, capacity: 4 },
  ];

  for (const s of slots) {
    await prisma.inspectorAvailabilitySlot.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }
  console.log('Availability slots: 5 created (AVAILABLE, BOOKED, CANCELLED)');

  // ─── APPOINTMENT RESTRICTIONS ─────────────────────────────────────────────

  await prisma.appointmentRestriction.upsert({
    where: { id: IDS.restr1 },
    update: {},
    create: {
      id: IDS.restr1,
      appointment_id: IDS.apptDraft,
      is_home: true,
      unavailable_days_json: ['MONDAY', 'TUESDAY'],
      unavailable_hours_json: { start: '08:00', end: '10:00' },
      notes: 'Tenant works from home on Monday and Tuesday mornings',
      source: 'TENANT_PORTAL',
    },
  });

  await prisma.appointmentRestriction.upsert({
    where: { id: IDS.restr2 },
    update: {},
    create: {
      id: IDS.restr2,
      appointment_id: IDS.apptAwaiting2,
      is_home: false,
      unavailable_days_json: ['WEDNESDAY'],
      notes: 'Tenant not home on Wednesdays',
      source: 'OPERATOR',
    },
  });
  console.log('Restrictions: 2 created');

  // ─── FINANCIAL ENTRIES ────────────────────────────────────────────────────

  const financialEntries = [
    // apptDone: approved debit + payout
    {
      id: IDS.fe1, tenant_id: IDS.tenant, appointment_id: IDS.apptDone, inspector_id: IDS.inspectorLinked,
      entry_type: 'TENANT_DEBIT' as const, amount: 150.00, currency: 'AUD', status: 'APPROVED' as const,
      description: 'Routine inspection at 200 Pacific Hwy, Crows Nest',
      effective_at: pastDate(3), initiated_by_user_id: IDS.userOP,
      approved_by_user_id: IDS.userAM, approved_at: pastDate(2),
    },
    {
      id: IDS.fe2, tenant_id: IDS.tenant, appointment_id: IDS.apptDone, inspector_id: IDS.inspectorLinked,
      entry_type: 'INSPECTOR_PAYOUT' as const, amount: 80.00, currency: 'AUD', status: 'APPROVED' as const,
      description: 'Payout to Mike Inspector — Routine inspection 200 Pacific Hwy',
      effective_at: pastDate(3), initiated_by_user_id: IDS.userOP,
      approved_by_user_id: IDS.userAM, approved_at: pastDate(2),
    },
    // apptDone2: pending debit + payout
    {
      id: IDS.fe3, tenant_id: IDS.tenant, appointment_id: IDS.apptDone2, inspector_id: IDS.inspectorIndep,
      entry_type: 'TENANT_DEBIT' as const, amount: 160.00, currency: 'AUD', status: 'PENDING' as const,
      description: 'Routine inspection at 5 Blue St, North Sydney',
      effective_at: pastDate(7), initiated_by_user_id: IDS.userOP,
    },
    {
      id: IDS.fe4, tenant_id: IDS.tenant, appointment_id: IDS.apptDone2, inspector_id: IDS.inspectorIndep,
      entry_type: 'INSPECTOR_PAYOUT' as const, amount: 88.00, currency: 'AUD', status: 'PENDING' as const,
      description: 'Payout to Carlos Mendez — Routine inspection 5 Blue St',
      effective_at: pastDate(7), initiated_by_user_id: IDS.userOP,
    },
    // Manual adjustments
    {
      id: IDS.fe5, tenant_id: IDS.tenant, appointment_id: null, inspector_id: null,
      entry_type: 'MANUAL_ADJUSTMENT' as const, amount: 50.00, currency: 'AUD', status: 'APPROVED' as const,
      description: 'Adjustment for double-billing error on March invoices',
      effective_at: pastDate(10), initiated_by_user_id: IDS.userAM,
      approved_by_user_id: IDS.userAM, approved_at: pastDate(9),
      reason: 'Billing correction — duplicate charge identified',
    },
    {
      id: IDS.fe6, tenant_id: IDS.tenant, appointment_id: null, inspector_id: null,
      entry_type: 'MANUAL_ADJUSTMENT' as const, amount: 25.00, currency: 'AUD', status: 'CANCELLED' as const,
      description: 'Incorrect adjustment — reversed',
      effective_at: pastDate(15), initiated_by_user_id: IDS.userOP,
      reason: 'Entry created in error, voided by AM',
    },
    // Refund
    {
      id: IDS.fe7, tenant_id: IDS.tenant, appointment_id: IDS.apptCancelled, inspector_id: null,
      entry_type: 'REFUND' as const, amount: 180.00, currency: 'AUD', status: 'PENDING' as const,
      description: 'Refund for cancelled outgoing inspection',
      effective_at: pastDate(1), initiated_by_user_id: IDS.userOP,
      reference_entry_id: null,
      reason: 'Service not rendered, tenant relocated',
    },
    // Tenant 2 approved entries
    {
      id: IDS.fe8, tenant_id: IDS.tenant2, appointment_id: IDS.apptDoneT2, inspector_id: IDS.inspectorLinked2,
      entry_type: 'TENANT_DEBIT' as const, amount: 140.00, currency: 'AUD', status: 'APPROVED' as const,
      description: 'Routine inspection at 100 St Kilda Rd, Southbank',
      effective_at: pastDate(4), initiated_by_user_id: IDS.userOP,
      approved_by_user_id: IDS.userAM, approved_at: pastDate(3),
    },
    {
      id: IDS.fe9, tenant_id: IDS.tenant2, appointment_id: IDS.apptDoneT2, inspector_id: IDS.inspectorLinked2,
      entry_type: 'INSPECTOR_PAYOUT' as const, amount: 75.00, currency: 'AUD', status: 'APPROVED' as const,
      description: 'Payout to Lisa Wong — Routine inspection 100 St Kilda Rd',
      effective_at: pastDate(4), initiated_by_user_id: IDS.userOP,
      approved_by_user_id: IDS.userAM, approved_at: pastDate(3),
    },
  ];

  for (const fe of financialEntries) {
    await prisma.financialEntry.upsert({
      where: { id: fe.id },
      update: {},
      create: {
        id: fe.id,
        tenant_id: fe.tenant_id,
        appointment_id: fe.appointment_id ?? null,
        inspector_id: fe.inspector_id ?? null,
        entry_type: fe.entry_type,
        amount: fe.amount,
        currency: fe.currency,
        status: fe.status,
        description: fe.description,
        effective_at: fe.effective_at,
        initiated_by_user_id: fe.initiated_by_user_id,
        approved_by_user_id: (fe as any).approved_by_user_id ?? null,
        approved_at: (fe as any).approved_at ?? null,
        reference_entry_id: (fe as any).reference_entry_id ?? null,
        reason: (fe as any).reason ?? null,
      },
    });
  }
  console.log(`Financial entries: ${financialEntries.length} created (all types, all statuses)`);

  // ─── INSPECTOR INVOICES ───────────────────────────────────────────────────

  const periodStart1 = new Date('2026-03-01');
  const periodEnd1 = new Date('2026-03-07');
  const periodStart2 = new Date('2026-03-08');
  const periodEnd2 = new Date('2026-03-14');
  const periodStart3 = new Date('2026-02-01');
  const periodEnd3 = new Date('2026-02-28');

  await prisma.inspectorInvoice.upsert({
    where: { inspector_id_period_start_period_end: { inspector_id: IDS.inspectorLinked, period_start: periodStart1, period_end: periodEnd1 } },
    update: {},
    create: {
      id: IDS.inv1,
      inspector_id: IDS.inspectorLinked,
      period_start: periodStart1,
      period_end: periodEnd1,
      period_type: 'WEEKLY',
      status: 'OPEN',
      total_amount: 80.00,
      currency: 'AUD',
    },
  });

  await prisma.inspectorInvoice.upsert({
    where: { inspector_id_period_start_period_end: { inspector_id: IDS.inspectorLinked, period_start: periodStart2, period_end: periodEnd2 } },
    update: {},
    create: {
      id: IDS.inv2,
      inspector_id: IDS.inspectorLinked,
      period_start: periodStart2,
      period_end: periodEnd2,
      period_type: 'WEEKLY',
      status: 'CLOSED',
      total_amount: 160.00,
      currency: 'AUD',
      file_key: 'invoices/inspector-linked/2026-W11.xlsx',
      generated_by_user_id: IDS.userAM,
      generated_at: pastDate(3),
    },
  });

  await prisma.inspectorInvoice.upsert({
    where: { inspector_id_period_start_period_end: { inspector_id: IDS.inspectorIndep, period_start: periodStart3, period_end: periodEnd3 } },
    update: {},
    create: {
      id: IDS.inv3,
      inspector_id: IDS.inspectorIndep,
      period_start: periodStart3,
      period_end: periodEnd3,
      period_type: 'MONTHLY',
      status: 'PAID',
      total_amount: 88.00,
      currency: 'AUD',
      file_key: 'invoices/inspector-indep/2026-02.xlsx',
      generated_by_user_id: IDS.userAM,
      generated_at: pastDate(15),
      paid_at: pastDate(10),
    },
  });
  console.log('Inspector invoices: 3 created (OPEN, CLOSED, PAID)');

  // ─── INSPECTION EXECUTIONS ────────────────────────────────────────────────

  // exec1: finished execution for apptDone
  await prisma.inspectionExecution.upsert({
    where: { appointment_id: IDS.apptDone },
    update: {},
    create: {
      id: IDS.exec1,
      appointment_id: IDS.apptDone,
      inspector_id: IDS.inspectorLinked,
      started_at: new Date(pastDate(3).getTime() + 9 * 3600000),
      finished_at: new Date(pastDate(3).getTime() + 11 * 3600000),
      start_latitude: -33.8268,
      start_longitude: 151.2022,
      finish_latitude: -33.8270,
      finish_longitude: 151.2025,
      checklist_json: { items: ['Smoke alarms', 'Water damage', 'HVAC', 'Locks'], completed: [true, false, true, true] },
      notes: 'Minor water stain on bathroom ceiling noted. All other items in good condition.',
    },
  });

  // exec2: in-progress execution for apptScheduled (inspector started)
  await prisma.inspectionExecution.upsert({
    where: { appointment_id: IDS.apptScheduled },
    update: {},
    create: {
      id: IDS.exec2,
      appointment_id: IDS.apptScheduled,
      inspector_id: IDS.inspectorLinked,
      started_at: new Date(),
      start_latitude: -33.8389,
      start_longitude: 151.2074,
      checklist_json: { items: ['Smoke alarms', 'Water damage', 'HVAC', 'Locks'], completed: [] },
    },
  });

  // exec3: finished execution for apptDoneT2
  await prisma.inspectionExecution.upsert({
    where: { appointment_id: IDS.apptDoneT2 },
    update: {},
    create: {
      id: IDS.exec3,
      appointment_id: IDS.apptDoneT2,
      inspector_id: IDS.inspectorLinked2,
      started_at: new Date(pastDate(4).getTime() + 9 * 3600000),
      finished_at: new Date(pastDate(4).getTime() + 11.5 * 3600000),
      start_latitude: -37.8305,
      start_longitude: 144.9675,
      finish_latitude: -37.8306,
      finish_longitude: 144.9677,
      checklist_json: { items: ['Smoke alarms', 'Water damage', 'Fixtures', 'Locks'], completed: [true, true, true, true] },
      notes: 'Property in excellent condition. All items pass.',
    },
  });
  console.log('Inspection executions: 3 created (2 finished, 1 in-progress)');

  // ─── INSPECTION ASSETS ────────────────────────────────────────────────────

  await prisma.inspectionAsset.upsert({
    where: { storage_key: 'executions/exec1/photo-bathroom-ceiling.jpg' },
    update: {},
    create: {
      id: IDS.asset1,
      appointment_id: IDS.apptDone,
      inspection_execution_id: IDS.exec1,
      storage_key: 'executions/exec1/photo-bathroom-ceiling.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 2048000,
      kind: 'PHOTO',
      status: 'UPLOADED',
      uploaded_by: IDS.userINSP,
    },
  });

  await prisma.inspectionAsset.upsert({
    where: { storage_key: 'executions/exec1/signature-tenant.png' },
    update: {},
    create: {
      id: IDS.asset2,
      appointment_id: IDS.apptDone,
      inspection_execution_id: IDS.exec1,
      storage_key: 'executions/exec1/signature-tenant.png',
      mime_type: 'image/png',
      size_bytes: 45000,
      kind: 'SIGNATURE',
      status: 'UPLOADED',
      uploaded_by: IDS.userINSP,
    },
  });

  await prisma.inspectionAsset.upsert({
    where: { storage_key: 'executions/exec2/photo-living-room.jpg' },
    update: {},
    create: {
      id: IDS.asset3,
      appointment_id: IDS.apptScheduled,
      inspection_execution_id: IDS.exec2,
      storage_key: 'executions/exec2/photo-living-room.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 0,
      kind: 'PHOTO',
      status: 'PENDING',
      uploaded_by: IDS.userINSP,
      upload_expires_at: new Date(Date.now() + 30 * 60000),
    },
  });

  await prisma.inspectionAsset.upsert({
    where: { storage_key: 'executions/exec1/report-document.pdf' },
    update: {},
    create: {
      id: IDS.asset4,
      appointment_id: IDS.apptDone,
      inspection_execution_id: IDS.exec1,
      storage_key: 'executions/exec1/report-document.pdf',
      mime_type: 'application/pdf',
      size_bytes: 0,
      kind: 'DOCUMENT',
      status: 'UPLOAD_FAILED',
      uploaded_by: IDS.userINSP,
    },
  });
  console.log('Inspection assets: 4 created (UPLOADED, PENDING, UPLOAD_FAILED)');

  // ─── TENANT PORTAL TOKENS ─────────────────────────────────────────────────

  await prisma.tenantPortalToken.upsert({
    where: { token_hash: 'sha256:active-token-for-scheduled-appointment' },
    update: {},
    create: {
      id: IDS.pt1,
      appointment_id: IDS.apptScheduled,
      token_hash: 'sha256:active-token-for-scheduled-appointment',
      expires_at: futureDate(30),
      status: 'ACTIVE',
      last_accessed_at: pastDate(1),
    },
  });

  await prisma.tenantPortalToken.upsert({
    where: { token_hash: 'sha256:expired-token-for-cancelled-appointment' },
    update: {},
    create: {
      id: IDS.pt2,
      appointment_id: IDS.apptCancelled2,
      token_hash: 'sha256:expired-token-for-cancelled-appointment',
      expires_at: pastDate(1),
      status: 'EXPIRED',
    },
  });

  await prisma.tenantPortalToken.upsert({
    where: { token_hash: 'sha256:revoked-token-for-draft-appointment' },
    update: {},
    create: {
      id: IDS.pt3,
      appointment_id: IDS.apptDraft,
      token_hash: 'sha256:revoked-token-for-draft-appointment',
      expires_at: futureDate(7),
      status: 'REVOKED',
    },
  });
  console.log('Portal tokens: 3 created (ACTIVE, EXPIRED, REVOKED)');

  // ─── TENANT PORTAL ACTIVITIES ─────────────────────────────────────────────

  await prisma.tenantPortalActivity.upsert({
    where: { id: IDS.pa1 },
    update: {},
    create: {
      id: IDS.pa1,
      appointment_id: IDS.apptScheduled,
      tenant_portal_token_id: IDS.pt1,
      action: 'VIEW',
      ip_address: '203.25.41.100',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    },
  });

  await prisma.tenantPortalActivity.upsert({
    where: { id: IDS.pa2 },
    update: {},
    create: {
      id: IDS.pa2,
      appointment_id: IDS.apptScheduled,
      tenant_portal_token_id: IDS.pt1,
      action: 'CONFIRM',
      previous_values_json: { tenant_confirmation_status: 'PENDING' },
      new_values_json: { tenant_confirmation_status: 'CONFIRMED' },
      ip_address: '203.25.41.100',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    },
  });

  await prisma.tenantPortalActivity.upsert({
    where: { id: IDS.pa3 },
    update: {},
    create: {
      id: IDS.pa3,
      appointment_id: IDS.apptCancelled2,
      tenant_portal_token_id: IDS.pt2,
      action: 'RESCHEDULE',
      previous_values_json: { scheduled_date: pastDate(2).toISOString(), time_slot: '10:00-13:00' },
      new_values_json: { preferred_date: futureDate(5).toISOString(), notes: 'Please reschedule to next week' },
      ip_address: '192.168.1.50',
    },
  });
  console.log('Portal activities: 3 created (VIEW, CONFIRM, RESCHEDULE)');

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  const notifications = [
    {
      id: IDS.notif1, tenant_id: IDS.tenant, appointment_id: IDS.apptDone,
      recipient: 'sophie.brown@gmail.com', channel: 'EMAIL' as const,
      template_code: 'INSPECTION_NOTICE', status: 'DELIVERED' as const,
      provider_name: 'resend', provider_message_id: 'msg_01HXYZ',
      sent_at: pastDate(10), delivered_at: pastDate(10),
      payload_json: { tenantName: 'Sophie Brown', propertyAddress: '200 Pacific Hwy, Crows Nest', scheduledDate: '2026-03-15', timeSlot: '09:00-12:00' },
    },
    {
      id: IDS.notif2, tenant_id: IDS.tenant, appointment_id: IDS.apptScheduled,
      recipient: '+61400555003', channel: 'SMS' as const,
      template_code: 'TENANT_SMS_ALERT', status: 'SENT' as const,
      provider_name: 'twilio', provider_message_id: 'SM01ABCDEF',
      sent_at: pastDate(2),
      payload_json: { propertyAddress: '5 Blue St, North Sydney', scheduledDate: '2026-03-25', portalUrl: 'https://portal.properfy.com.au/t/abc123' },
    },
    {
      id: IDS.notif3, tenant_id: IDS.tenant, appointment_id: IDS.apptAwaiting,
      recipient: 'maria.garcia@gmail.com', channel: 'EMAIL' as const,
      template_code: 'REMINDER_7_DAYS', status: 'FAILED' as const,
      provider_name: 'resend',
      failed_at: pastDate(3), failure_reason: 'Recipient email address bounced',
      retry_count: 6, next_retry_at: null,
      payload_json: { tenantName: 'Maria Garcia', propertyAddress: '88 Crown St, Surry Hills', scheduledDate: '2026-03-28' },
    },
    {
      id: IDS.notif4, tenant_id: IDS.tenant, appointment_id: IDS.apptDraft,
      recipient: 'john.smith@gmail.com', channel: 'EMAIL' as const,
      template_code: 'INSPECTION_NOTICE', status: 'PENDING' as const,
      retry_count: 0,
      next_retry_at: new Date(Date.now() + 5 * 60000),
      payload_json: { tenantName: 'John Smith', propertyAddress: '12 Harbour St, Sydney', scheduledDate: '2026-04-01' },
    },
    {
      id: IDS.notif5, tenant_id: IDS.tenant, appointment_id: IDS.apptDone2,
      recipient: '+61400555008', channel: 'SMS' as const,
      template_code: 'TENANT_SMS_ALERT', status: 'DELIVERED' as const,
      provider_name: 'twilio', provider_message_id: 'SM02GHIJKL',
      sent_at: pastDate(8), delivered_at: pastDate(8),
      payload_json: { propertyAddress: '5 Blue St, North Sydney', scheduledDate: '2026-03-11' },
    },
    {
      id: IDS.notif6, tenant_id: IDS.tenant2, appointment_id: IDS.apptScheduledT2,
      recipient: 'ben.rogers@gmail.com', channel: 'EMAIL' as const,
      template_code: 'INSPECTION_NOTICE', status: 'PENDING' as const,
      retry_count: 0,
      payload_json: { tenantName: 'Ben Rogers', propertyAddress: '5 Church St, Richmond', scheduledDate: '2026-03-26' },
    },
  ];

  for (const n of notifications) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id,
        tenant_id: n.tenant_id,
        appointment_id: n.appointment_id ?? null,
        recipient: n.recipient,
        channel: n.channel,
        template_code: n.template_code,
        status: n.status,
        provider_name: (n as any).provider_name ?? null,
        provider_message_id: (n as any).provider_message_id ?? null,
        sent_at: (n as any).sent_at ?? null,
        delivered_at: (n as any).delivered_at ?? null,
        failed_at: (n as any).failed_at ?? null,
        failure_reason: (n as any).failure_reason ?? null,
        payload_json: n.payload_json,
        retry_count: n.retry_count ?? 0,
        next_retry_at: (n as any).next_retry_at ?? null,
      },
    });
  }
  console.log(`Notifications: ${notifications.length} created (EMAIL, SMS; all statuses)`);

  // ─── NOTIFICATION TEMPLATES ───────────────────────────────────────────────

  const templates = [
    { code: 'INSPECTION_NOTICE', channel: 'EMAIL' as const, subject: 'Upcoming Property Inspection', body: 'Dear {{tenantName}}, an inspection has been scheduled for {{propertyAddress}} on {{scheduledDate}} between {{timeSlot}}.' },
    { code: 'REMINDER_7_DAYS', channel: 'EMAIL' as const, subject: 'Inspection Reminder - 7 Days', body: 'Dear {{tenantName}}, this is a reminder that your property inspection at {{propertyAddress}} is in 7 days on {{scheduledDate}}.' },
    { code: 'REMINDER_5_DAYS', channel: 'EMAIL' as const, subject: 'Inspection Reminder - 5 Days', body: 'Dear {{tenantName}}, your property inspection at {{propertyAddress}} is in 5 days on {{scheduledDate}}.' },
    { code: 'REMINDER_3_DAYS', channel: 'EMAIL' as const, subject: 'Inspection Reminder - 3 Days', body: 'Dear {{tenantName}}, your property inspection at {{propertyAddress}} is in 3 days on {{scheduledDate}}.' },
    { code: 'PROPERTY_MANAGER_ESCALATION', channel: 'EMAIL' as const, subject: 'Tenant Not Responding - Escalation', body: 'The tenant {{tenantName}} at {{propertyAddress}} has not responded to the inspection notice for {{scheduledDate}}. Please follow up.' },
    { code: 'TENANT_SMS_ALERT', channel: 'SMS' as const, subject: null, body: 'Properfy: Inspection at {{propertyAddress}} on {{scheduledDate}}. Confirm at {{portalUrl}}' },
    { code: 'INSPECTION_CONFIRMED', channel: 'EMAIL' as const, subject: 'Inspection Confirmed', body: 'Dear {{tenantName}}, your inspection at {{propertyAddress}} on {{scheduledDate}} has been confirmed.' },
    { code: 'INSPECTION_RESCHEDULED', channel: 'EMAIL' as const, subject: 'Inspection Rescheduled', body: 'Dear {{tenantName}}, the inspection at {{propertyAddress}} has been rescheduled. New details will follow.' },
    { code: 'INSPECTION_CANCELLED', channel: 'EMAIL' as const, subject: 'Inspection Cancelled', body: 'Dear {{tenantName}}, the inspection at {{propertyAddress}} on {{scheduledDate}} has been cancelled.' },
    { code: 'INSPECTION_UNAVAILABILITY_REPORTED', channel: 'EMAIL' as const, subject: 'Tenant Reported Unavailability', body: 'The tenant {{tenantName}} reported that the inspection at {{propertyAddress}} on {{scheduledDate}} is unavailable. Review appointment {{appointmentReference}} for follow-up.' },
  ];

  for (const t of templates) {
    const variables = (t.body.match(/\{\{(\w+)\}\}/g) ?? []).map((v: string) => v.replace(/\{\{|\}\}/g, ''));
    for (const tenantId of [null, IDS.tenant, IDS.tenant2]) {
      const existingTemplate = await prisma.notificationTemplate.findFirst({
        where: {
          tenant_id: tenantId,
          template_code: t.code,
          channel: t.channel,
        },
        select: { id: true },
      });

      if (existingTemplate) {
        await prisma.notificationTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            subject: t.subject,
            body_text: t.body,
            body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
            variables_json: variables,
            is_active: true,
          },
        });
        continue;
      }

      await prisma.notificationTemplate.create({
        data: {
          tenant_id: tenantId,
          template_code: t.code,
          channel: t.channel,
          subject: t.subject,
          body_text: t.body,
          body_html: t.channel === 'EMAIL' ? `<p>${t.body}</p>` : null,
          variables_json: variables,
          is_active: true,
        },
      });
    }
  }
  console.log('Notification templates: 10 templates synced for platform default + 2 tenants');

  // ─── REPORTS ──────────────────────────────────────────────────────────────

  await prisma.report.upsert({
    where: { id: IDS.rpt1 },
    update: {},
    create: {
      id: IDS.rpt1,
      tenant_id: IDS.tenant,
      report_type: 'INSPECTIONS_DONE',
      filters_json: { tenantId: IDS.tenant, from: '2026-03-01', to: '2026-03-31' },
      format: 'XLSX',
      status: 'READY',
      file_key: 'reports/tenant1/inspections-done-march-2026.xlsx',
      requested_by_user_id: IDS.userCLAdmin,
      started_at: pastDate(2),
      completed_at: pastDate(2),
      row_count: 2,
      expires_at: futureDate(7),
    },
  });

  await prisma.report.upsert({
    where: { id: IDS.rpt2 },
    update: {},
    create: {
      id: IDS.rpt2,
      tenant_id: IDS.tenant,
      report_type: 'FINANCIAL_SERVICES',
      filters_json: { tenantId: IDS.tenant, from: '2026-03-01', to: '2026-03-31' },
      format: 'XLSX',
      status: 'PENDING',
      requested_by_user_id: IDS.userAM,
    },
  });

  await prisma.report.upsert({
    where: { id: IDS.rpt3 },
    update: {},
    create: {
      id: IDS.rpt3,
      tenant_id: null,
      report_type: 'INSPECTOR_PERFORMANCE',
      filters_json: { from: '2026-01-01', to: '2026-03-31' },
      format: 'XLSX',
      status: 'PROCESSING',
      requested_by_user_id: IDS.userAM,
      started_at: new Date(),
    },
  });

  await prisma.report.upsert({
    where: { id: IDS.rpt4 },
    update: {},
    create: {
      id: IDS.rpt4,
      tenant_id: IDS.tenant2,
      report_type: 'CONFIRMATION_STATUS',
      filters_json: { tenantId: IDS.tenant2, from: '2026-03-01', to: '2026-03-31' },
      format: 'XLSX',
      status: 'FAILED',
      requested_by_user_id: IDS.userCLAdmin2,
      started_at: pastDate(1),
      failed_at: pastDate(1),
      error_message: 'Database timeout while processing report data',
    },
  });
  console.log('Reports: 4 created (READY, PENDING, PROCESSING, FAILED)');

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────

  const auditLogs = [
    {
      id: '90000000-0000-0000-0000-000000000001',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userOP,
      entity_type: 'Appointment',
      entity_id: IDS.apptDraft,
      action: 'appointment.status.DRAFT_TO_AWAITING_INSPECTOR',
      before_json: { status: 'DRAFT' },
      after_json: { status: 'AWAITING_INSPECTOR' },
    },
    {
      id: '90000000-0000-0000-0000-000000000002',
      tenant_id: IDS.tenant,
      actor_type: 'SYSTEM' as const,
      actor_id: null,
      entity_type: 'Appointment',
      entity_id: IDS.apptScheduled,
      action: 'appointment.status.AWAITING_INSPECTOR_TO_SCHEDULED',
      before_json: { status: 'AWAITING_INSPECTOR', inspector_id: null },
      after_json: { status: 'SCHEDULED', inspector_id: IDS.inspectorLinked },
    },
    {
      id: '90000000-0000-0000-0000-000000000003',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userOP,
      entity_type: 'Appointment',
      entity_id: IDS.apptDone,
      action: 'appointment.status.SCHEDULED_TO_DONE',
      before_json: { status: 'SCHEDULED' },
      after_json: { status: 'DONE', done_checked_by_user_id: IDS.userOP },
    },
    {
      id: '90000000-0000-0000-0000-000000000004',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userCLAdmin,
      entity_type: 'Appointment',
      entity_id: IDS.apptCancelled,
      action: 'appointment.status.SCHEDULED_TO_CANCELLED',
      reason: 'Tenant relocated early, inspection no longer needed',
      before_json: { status: 'SCHEDULED' },
      after_json: { status: 'CANCELLED', reason: 'Tenant relocated early' },
    },
    {
      id: '90000000-0000-0000-0000-000000000005',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userOP,
      entity_type: 'Appointment',
      entity_id: IDS.apptRejected,
      action: 'appointment.status.DRAFT_TO_REJECTED',
      reason: 'Property address does not exist, impossible to execute',
      before_json: { status: 'DRAFT' },
      after_json: { status: 'REJECTED', reason: 'Property address does not exist' },
    },
    {
      id: '90000000-0000-0000-0000-000000000006',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userAM,
      entity_type: 'FinancialEntry',
      entity_id: IDS.fe1,
      action: 'financial_entry.approved',
      before_json: { status: 'PENDING' },
      after_json: { status: 'APPROVED', approved_by: IDS.userAM },
    },
    {
      id: '90000000-0000-0000-0000-000000000007',
      tenant_id: IDS.tenant,
      actor_type: 'USER' as const,
      actor_id: IDS.userAM,
      entity_type: 'User',
      entity_id: IDS.userInactive,
      action: 'user.deactivated',
      before_json: { status: 'ACTIVE' },
      after_json: { status: 'INACTIVE' },
    },
  ];

  for (const log of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: {
        id: log.id,
        tenant_id: log.tenant_id ?? null,
        actor_type: log.actor_type,
        actor_id: log.actor_id ?? null,
        entity_type: log.entity_type,
        entity_id: log.entity_id ?? null,
        action: log.action,
        reason: (log as any).reason ?? null,
        before_json: log.before_json ?? null,
        after_json: log.after_json ?? null,
      },
    });
  }
  console.log(`Audit logs: ${auditLogs.length} created`);

  // ─── APPOINTMENT IMPORTS ──────────────────────────────────────────────────

  await prisma.appointmentImport.upsert({
    where: { id: IDS.apptImport1 },
    update: {},
    create: {
      id: IDS.apptImport1,
      tenant_id: IDS.tenant,
      status: 'COMPLETED',
      file_key: 'imports/appointments/2026-03-10-batch-import.xlsx',
      original_filename: 'march-appointments.xlsx',
      total_rows: 5,
      success_count: 5,
      error_count: 0,
      created_by_user_id: IDS.userOP,
    },
  });

  await prisma.appointmentImport.upsert({
    where: { id: IDS.apptImport2 },
    update: {},
    create: {
      id: IDS.apptImport2,
      tenant_id: IDS.tenant,
      status: 'FAILED',
      file_key: 'imports/appointments/2026-03-15-bad-import.xlsx',
      original_filename: 'appointments-with-errors.xlsx',
      total_rows: 3,
      success_count: 0,
      error_count: 3,
      errors_json: [
        { row: 2, field: 'property_code', message: 'Property SPS-999 not found' },
        { row: 3, field: 'scheduled_date', message: 'Date cannot be in the past' },
        { row: 4, field: 'service_type', message: 'Unknown service type: SPECIAL' },
      ],
      created_by_user_id: IDS.userCLAdmin,
    },
  });
  console.log('Appointment imports: 2 created (COMPLETED, FAILED)');

  // ─── PROPERTY IMPORTS ─────────────────────────────────────────────────────

  await prisma.propertyImport.upsert({
    where: { id: IDS.propImport1 },
    update: {},
    create: {
      id: IDS.propImport1,
      tenant_id: IDS.tenant,
      status: 'COMPLETED',
      file_key: 'imports/properties/2026-03-01-initial-properties.xlsx',
      original_filename: 'initial-property-list.xlsx',
      total_rows: 7,
      success_count: 7,
      error_count: 0,
      created_by_user_id: IDS.userOP,
    },
  });

  await prisma.propertyImport.upsert({
    where: { id: IDS.propImport2 },
    update: {},
    create: {
      id: IDS.propImport2,
      tenant_id: IDS.tenant2,
      status: 'PROCESSING',
      file_key: 'imports/properties/tenant2-2026-03-18.xlsx',
      original_filename: 'melbourne-properties.xlsx',
      total_rows: 20,
      success_count: 12,
      error_count: 0,
      created_by_user_id: IDS.userCLAdmin2,
    },
  });
  console.log('Property imports: 2 created (COMPLETED, PROCESSING)');

  // ── Appointment Time Slots (tenant-wide defaults) ─────────────────────
  for (const tenantId of [IDS.tenant, IDS.tenant2]) {
    await prisma.appointmentTimeSlot.upsert({
      where: {
        tenant_id_branch_id_start_time_end_time: {
          tenant_id: tenantId,
          branch_id: null as any,
          start_time: '09:00',
          end_time: '12:00',
        },
      },
      update: {},
      create: {
        tenant_id: tenantId,
        branch_id: null,
        label: 'Morning',
        start_time: '09:00',
        end_time: '12:00',
        sort_order: 0,
      },
    });
    await prisma.appointmentTimeSlot.upsert({
      where: {
        tenant_id_branch_id_start_time_end_time: {
          tenant_id: tenantId,
          branch_id: null as any,
          start_time: '14:00',
          end_time: '17:00',
        },
      },
      update: {},
      create: {
        tenant_id: tenantId,
        branch_id: null,
        label: 'Afternoon',
        start_time: '14:00',
        end_time: '17:00',
        sort_order: 1,
      },
    });
  }
  console.log('Appointment time slots: 2 per tenant (Morning, Afternoon)');

  console.log('\n✓ Seeding complete!');
  console.log('─'.repeat(60));
  console.log('Login credentials (all users): password = Admin@1234');
  console.log('  admin@pedroalvs.com      → AM (Admin Master)');
  console.log('  op@pedroalvs.com         → OP (Operator)');
  console.log('  cl.admin@pedroalvs.com   → CL_ADMIN (Sydney tenant)');
  console.log('  cl.user@pedroalvs.com    → CL_USER  (Sydney tenant)');
  console.log('  cl.admin2@pedroalvs.com  → CL_ADMIN (Melbourne tenant)');
  console.log('  insp@pedroalvs.com       → INSP (Inspector Mike)');
  console.log('  insp2@pedroalvs.com      → INSP (Inspector Lisa)');
  console.log('─'.repeat(60));
  console.log(`Tenant 1 ID: ${IDS.tenant}`);
  console.log(`Tenant 2 ID: ${IDS.tenant2}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
