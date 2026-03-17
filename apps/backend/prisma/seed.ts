import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic UUIDs for stable references
const IDS = {
  // Tenant
  tenant: '10000000-0000-0000-0000-000000000001',
  // Branches
  branchCity: '20000000-0000-0000-0000-000000000001',
  branchNorth: '20000000-0000-0000-0000-000000000002',
  // Users
  userAM: '00000000-0000-0000-0000-000000000001',
  userOP: '00000000-0000-0000-0000-000000000002',
  userCLAdmin: '00000000-0000-0000-0000-000000000003',
  userCLUser: '00000000-0000-0000-0000-000000000004',
  userINSP: '00000000-0000-0000-0000-000000000005',
  // Inspectors
  inspectorLinked: '30000000-0000-0000-0000-000000000001',
  inspectorIndep: '30000000-0000-0000-0000-000000000002',
  // Service types
  stRoutine: '40000000-0000-0000-0000-000000000001',
  stIngoing: '40000000-0000-0000-0000-000000000002',
  stOutgoing: '40000000-0000-0000-0000-000000000003',
  // Pricing rules
  prRoutine: '50000000-0000-0000-0000-000000000001',
  prIngoing: '50000000-0000-0000-0000-000000000002',
  // Properties
  prop1: '60000000-0000-0000-0000-000000000001',
  prop2: '60000000-0000-0000-0000-000000000002',
  prop3: '60000000-0000-0000-0000-000000000003',
  prop4: '60000000-0000-0000-0000-000000000004',
  prop5: '60000000-0000-0000-0000-000000000005',
  // Appointments
  apptDraft: '70000000-0000-0000-0000-000000000001',
  apptAwaiting: '70000000-0000-0000-0000-000000000002',
  apptScheduled: '70000000-0000-0000-0000-000000000003',
  apptDone: '70000000-0000-0000-0000-000000000004',
  apptCancelled: '70000000-0000-0000-0000-000000000005',
  // Service group
  serviceGroup: '80000000-0000-0000-0000-000000000001',
} as const;

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  // --- Tenant ---
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
  console.log(`Tenant: ${tenant.name}`);

  // --- Branches ---
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
  console.log(`Branches: ${branchCity.name}, ${branchNorth.name}`);

  // --- Users ---
  const users = [
    { id: IDS.userAM, tenant_id: null, branch_id: null, role: 'AM' as const, name: 'Admin Master', email: 'admin@properfy.com' },
    { id: IDS.userOP, tenant_id: null, branch_id: null, role: 'OP' as const, name: 'Sarah Operator', email: 'sarah.op@properfy.com' },
    { id: IDS.userCLAdmin, tenant_id: IDS.tenant, branch_id: IDS.branchCity, role: 'CL_ADMIN' as const, name: 'James Chen', email: 'james@sydneypropservices.com.au' },
    { id: IDS.userCLUser, tenant_id: IDS.tenant, branch_id: IDS.branchNorth, role: 'CL_USER' as const, name: 'Emily Park', email: 'emily@sydneypropservices.com.au' },
    { id: IDS.userINSP, tenant_id: null, branch_id: null, role: 'INSP' as const, name: 'Mike Inspector', email: 'mike@inspectors.com.au' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        tenant_id: u.tenant_id,
        branch_id: u.branch_id,
        role: u.role,
        name: u.name,
        email: u.email,
        status: 'ACTIVE',
        password_hash: passwordHash,
        totp_enabled: false,
      },
    });
  }
  console.log(`Users: ${users.length} created`);

  // --- Inspectors ---
  await prisma.inspector.upsert({
    where: { id: IDS.inspectorLinked },
    update: {},
    create: {
      id: IDS.inspectorLinked,
      user_id: IDS.userINSP,
      name: 'Mike Inspector',
      email: 'mike@inspectors.com.au',
      phone: '+61400111222',
      status: 'ACTIVE',
      regions_json: ['Sydney CBD', 'North Shore', 'Inner West'],
    },
  });

  await prisma.inspector.upsert({
    where: { id: IDS.inspectorIndep },
    update: {},
    create: {
      id: IDS.inspectorIndep,
      name: 'Lisa Wong',
      email: 'lisa.wong@inspectors.com.au',
      phone: '+61400333444',
      status: 'ACTIVE',
      regions_json: ['Eastern Suburbs', 'South Sydney'],
    },
  });
  console.log('Inspectors: 2 created');

  // --- Service Types ---
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

  // --- Pricing Rules ---
  await prisma.servicePriceRule.upsert({
    where: { tenant_id_service_type_id_branch_id: { tenant_id: IDS.tenant, service_type_id: IDS.stRoutine, branch_id: IDS.branchCity } },
    update: {},
    create: {
      id: IDS.prRoutine,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stRoutine,
      branch_id: IDS.branchCity,
      price_amount: 150.00,
      payout_type: 'FIXED',
      payout_value: 80.00,
    },
  });

  await prisma.servicePriceRule.upsert({
    where: { tenant_id_service_type_id_branch_id: { tenant_id: IDS.tenant, service_type_id: IDS.stIngoing, branch_id: IDS.branchCity } },
    update: {},
    create: {
      id: IDS.prIngoing,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stIngoing,
      branch_id: IDS.branchCity,
      price_amount: 220.00,
      payout_type: 'FIXED',
      payout_value: 120.00,
    },
  });
  console.log('Pricing rules: 2 created');

  // --- Properties ---
  const properties = [
    { id: IDS.prop1, branch_id: IDS.branchCity, property_code: 'SPS-001', type: 'RESIDENTIAL' as const, street: '12 Harbour St', suburb: 'Sydney', postcode: '2000', state: 'NSW', lat: -33.8688, lng: 151.2093 },
    { id: IDS.prop2, branch_id: IDS.branchCity, property_code: 'SPS-002', type: 'RESIDENTIAL' as const, street: '88 Crown St', suburb: 'Surry Hills', postcode: '2010', state: 'NSW', lat: -33.8838, lng: 151.2122 },
    { id: IDS.prop3, branch_id: IDS.branchNorth, property_code: 'SPS-003', type: 'RESIDENTIAL' as const, street: '5 Blue St', suburb: 'North Sydney', postcode: '2060', state: 'NSW', lat: -33.8389, lng: 151.2074 },
    { id: IDS.prop4, branch_id: IDS.branchNorth, property_code: 'SPS-004', type: 'COMMERCIAL' as const, street: '200 Pacific Hwy', suburb: 'Crows Nest', postcode: '2065', state: 'NSW', lat: -33.8268, lng: 151.2022 },
    { id: IDS.prop5, branch_id: IDS.branchCity, property_code: 'SPS-005', type: 'RESIDENTIAL' as const, street: '33 Glebe Point Rd', suburb: 'Glebe', postcode: '2037', state: 'NSW', lat: -33.8785, lng: 151.1867 },
  ];

  for (const p of properties) {
    await prisma.property.upsert({
      where: { tenant_id_property_code: { tenant_id: IDS.tenant, property_code: p.property_code } },
      update: {},
      create: {
        id: p.id,
        tenant_id: IDS.tenant,
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
        geocoding_status: 'SUCCESS',
      },
    });
  }
  console.log('Properties: 5 created');

  // --- Appointments ---
  const pricingSnapshot = { price_amount: 150, payout_value: 80, payout_type: 'FIXED', service_type: 'ROUTINE' };
  const today = new Date();
  const futureDate = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };
  const pastDate = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  // DRAFT
  await prisma.appointment.upsert({
    where: { id: IDS.apptDraft },
    update: {},
    create: {
      id: IDS.apptDraft,
      tenant_id: IDS.tenant,
      branch_id: IDS.branchCity,
      property_id: IDS.prop1,
      service_type_id: IDS.stRoutine,
      status: 'DRAFT',
      scheduled_date: futureDate(14),
      time_slot: '09:00-12:00',
      price_amount: 150.00,
      payout_amount: 80.00,
      pricing_rule_snapshot_json: pricingSnapshot,
      created_by_user_id: IDS.userCLAdmin,
    },
  });

  // AWAITING_INSPECTOR
  await prisma.appointment.upsert({
    where: { id: IDS.apptAwaiting },
    update: {},
    create: {
      id: IDS.apptAwaiting,
      tenant_id: IDS.tenant,
      branch_id: IDS.branchCity,
      property_id: IDS.prop2,
      service_type_id: IDS.stRoutine,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: futureDate(10),
      time_slot: '09:00-12:00',
      price_amount: 150.00,
      payout_amount: 80.00,
      pricing_rule_snapshot_json: pricingSnapshot,
      created_by_user_id: IDS.userOP,
    },
  });

  // SCHEDULED
  await prisma.appointment.upsert({
    where: { id: IDS.apptScheduled },
    update: {},
    create: {
      id: IDS.apptScheduled,
      tenant_id: IDS.tenant,
      branch_id: IDS.branchNorth,
      property_id: IDS.prop3,
      service_type_id: IDS.stIngoing,
      inspector_id: IDS.inspectorLinked,
      status: 'SCHEDULED',
      scheduled_date: futureDate(7),
      time_slot: '13:00-16:00',
      tenant_confirmation_status: 'CONFIRMED',
      price_amount: 220.00,
      payout_amount: 120.00,
      pricing_rule_snapshot_json: { ...pricingSnapshot, price_amount: 220, payout_value: 120, service_type: 'INGOING' },
      created_by_user_id: IDS.userOP,
    },
  });

  // DONE
  await prisma.appointment.upsert({
    where: { id: IDS.apptDone },
    update: {},
    create: {
      id: IDS.apptDone,
      tenant_id: IDS.tenant,
      branch_id: IDS.branchNorth,
      property_id: IDS.prop4,
      service_type_id: IDS.stRoutine,
      inspector_id: IDS.inspectorLinked,
      status: 'DONE',
      scheduled_date: pastDate(3),
      time_slot: '09:00-12:00',
      tenant_confirmation_status: 'CONFIRMED',
      price_amount: 150.00,
      payout_amount: 80.00,
      pricing_rule_snapshot_json: pricingSnapshot,
      created_by_user_id: IDS.userCLAdmin,
      done_checked_by_user_id: IDS.userOP,
      done_checked_at: pastDate(2),
    },
  });

  // CANCELLED
  await prisma.appointment.upsert({
    where: { id: IDS.apptCancelled },
    update: {},
    create: {
      id: IDS.apptCancelled,
      tenant_id: IDS.tenant,
      branch_id: IDS.branchCity,
      property_id: IDS.prop5,
      service_type_id: IDS.stOutgoing,
      status: 'CANCELLED',
      scheduled_date: pastDate(1),
      time_slot: '09:00-12:00',
      price_amount: 180.00,
      payout_amount: 100.00,
      pricing_rule_snapshot_json: { ...pricingSnapshot, price_amount: 180, payout_value: 100, service_type: 'OUTGOING' },
      reason: 'Tenant relocated early, inspection no longer needed',
      created_by_user_id: IDS.userCLAdmin,
    },
  });
  console.log('Appointments: 5 created (DRAFT, AWAITING_INSPECTOR, SCHEDULED, DONE, CANCELLED)');

  // --- Appointment Contacts ---
  const contacts = [
    { appointment_id: IDS.apptDraft, tenant_name: 'John Smith', primary_email: 'john.smith@gmail.com', primary_phone: '+61400555001' },
    { appointment_id: IDS.apptAwaiting, tenant_name: 'Maria Garcia', primary_email: 'maria.garcia@gmail.com', primary_phone: '+61400555002' },
    { appointment_id: IDS.apptScheduled, tenant_name: 'David Lee', primary_email: 'david.lee@gmail.com', primary_phone: '+61400555003' },
    { appointment_id: IDS.apptDone, tenant_name: 'Sophie Brown', primary_email: 'sophie.brown@gmail.com', primary_phone: '+61400555004' },
    { appointment_id: IDS.apptCancelled, tenant_name: 'Alex Kim', primary_email: 'alex.kim@gmail.com', primary_phone: '+61400555005' },
  ];

  for (const c of contacts) {
    await prisma.appointmentContact.upsert({
      where: { appointment_id: c.appointment_id },
      update: {},
      create: c,
    });
  }

  // --- Service Group (with 2 appointments) ---
  await prisma.serviceGroup.upsert({
    where: { id: IDS.serviceGroup },
    update: {},
    create: {
      id: IDS.serviceGroup,
      tenant_id: IDS.tenant,
      service_type_id: IDS.stRoutine,
      status: 'PUBLISHED',
      group_size: 2,
      offered_count: 0,
      confirmed_count: 0,
      scheduled_date: futureDate(10),
      time_window: '09:00-17:00',
      published_at: new Date(),
      created_by_user_id: IDS.userOP,
    },
  });

  // Link AWAITING_INSPECTOR and DRAFT to the service group
  await prisma.appointment.update({
    where: { id: IDS.apptAwaiting },
    data: { service_group_id: IDS.serviceGroup },
  });
  console.log('Service group: 1 created (PUBLISHED, 1 appointment linked)');

  // --- Notification Templates (9 mandatory) ---
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
  ];

  for (const t of templates) {
    const variables = (t.body.match(/\{\{(\w+)\}\}/g) ?? []).map((v: string) => v.replace(/\{\{|\}\}/g, ''));
    await prisma.notificationTemplate.upsert({
      where: {
        tenant_id_template_code_channel: {
          tenant_id: IDS.tenant,
          template_code: t.code,
          channel: t.channel,
        },
      },
      update: {},
      create: {
        tenant_id: IDS.tenant,
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
  console.log('Notification templates: 9 mandatory templates created');

  console.log('\nSeeding complete!');
  console.log('Login credentials: any user email with password Admin@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
