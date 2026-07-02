/**
 * Manual emitter — run when template columns change.
 * Usage from repo root: node apps/web/scripts/generate-import-templates.cjs
 * Outputs: apps/web/public/templates/appointments-import-template.csv
 *
 * Columns mirror `APPOINTMENT_IMPORT_HEADER_MAP` in
 * apps/backend/src/modules/appointment/infrastructure/appointment-import-parser.ts
 * exactly — keep the two in sync. Custom fields are any `CUSTOM: {name}`
 * header (max 4); the example rows below show all 4 slots filled in.
 */
const fs = require('fs');
const path = require('path');

const HEADERS = [
  'Type', 'Date', 'Start Time', 'End Time',
  'Street', 'Suburb', 'State', 'Postcode', 'Country', 'Address line 2',
  'Notes', 'Realty description',
  'Tenant name', 'Tenant mail', 'Tenant phone',
  'EMAIL: Tenant secondary mail', 'PHONE: Tenant secondary phone',
  'EMAIL: Tenant tertiary mail', 'PHONE: Tenant tertiary phone',
  'EMAIL: Tenant quaternary mail', 'PHONE: Tenant quaternary phone',
  'CUSTOM: Complete Property Address', 'CUSTOM: Access Instructions',
  'CUSTOM: Alarm Code', 'CUSTOM: Parking Notes',
];

const ROWS = [
  {
    'Type': 'Routine Inspection', 'Date': '2027-06-15', 'Start Time': '08:00', 'End Time': '17:00',
    'Street': '12 Example St', 'Suburb': 'Kogarah', 'State': 'NSW', 'Postcode': '2217', 'Country': 'AU', 'Address line 2': 'Unit 4',
    'Notes': 'Front gate code 1234', 'Realty description': '3-bedroom townhouse',
    'Tenant name': 'Jane Smith', 'Tenant mail': 'jane.smith@example.com', 'Tenant phone': '0400000001',
    'EMAIL: Tenant secondary mail': 'jane.alt@example.com', 'PHONE: Tenant secondary phone': '0400000002',
    'EMAIL: Tenant tertiary mail': '', 'PHONE: Tenant tertiary phone': '',
    'EMAIL: Tenant quaternary mail': '', 'PHONE: Tenant quaternary phone': '',
    'CUSTOM: Complete Property Address': '12 Example St, Unit 4, Kogarah NSW 2217',
    'CUSTOM: Access Instructions': 'Ring buzzer 4', 'CUSTOM: Alarm Code': '9182', 'CUSTOM: Parking Notes': 'Street parking only',
  },
  {
    'Type': 'Ingoing Inspection', 'Date': '', 'Start Time': '', 'End Time': '',
    'Street': '88 Sample Rd', 'Suburb': 'Carlton', 'State': 'VIC', 'Postcode': '3053', 'Country': 'AU', 'Address line 2': '',
    'Notes': '', 'Realty description': '',
    'Tenant name': 'John Doe, Alex Doe', 'Tenant mail': 'john.doe@example.com', 'Tenant phone': '0400000003',
    'EMAIL: Tenant secondary mail': '', 'PHONE: Tenant secondary phone': '',
    'EMAIL: Tenant tertiary mail': '', 'PHONE: Tenant tertiary phone': '',
    'EMAIL: Tenant quaternary mail': '', 'PHONE: Tenant quaternary phone': '',
    'CUSTOM: Complete Property Address': '88 Sample Rd, Carlton VIC 3053',
    'CUSTOM: Access Instructions': '', 'CUSTOM: Alarm Code': '', 'CUSTOM: Parking Notes': '',
  },
];

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function generate() {
  const lines = [
    HEADERS.map(csvEscape).join(','),
    ...ROWS.map((row) => HEADERS.map((h) => csvEscape(row[h])).join(',')),
  ];

  const outPath = path.resolve(__dirname, '../public/templates/appointments-import-template.csv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('Generated:', outPath);
}

generate();
