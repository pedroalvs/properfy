/**
 * Manual emitter — run when template columns change.
 * Usage from repo root: node apps/web/scripts/generate-import-templates.cjs
 * Outputs: apps/web/public/templates/appointments-import-template.xlsx
 */
const path = require('path');
const ExcelJS = require(path.resolve(__dirname, '../../backend/node_modules/exceljs'));

async function generate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Properfy';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Appointments');

  sheet.columns = [
    { header: 'branchName', key: 'branchName', width: 20 },
    { header: 'propertyCode', key: 'propertyCode', width: 20 },
    { header: 'serviceTypeCode', key: 'serviceTypeCode', width: 20 },
    { header: 'scheduledDate', key: 'scheduledDate', width: 15 },
    { header: 'timeSlotLabel', key: 'timeSlotLabel', width: 15 },
    { header: 'keyRequired', key: 'keyRequired', width: 12 },
    { header: 'primaryContactName', key: 'primaryContactName', width: 25 },
    { header: 'primaryContactEmail', key: 'primaryContactEmail', width: 30 },
    { header: 'primaryContactPhone', key: 'primaryContactPhone', width: 20 },
    { header: 'notes', key: 'notes', width: 30 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E9F0' },
  };
  headerRow.commit();

  // Example rows
  sheet.addRow({
    branchName: 'Main Branch',
    propertyCode: 'PROP-001',
    serviceTypeCode: 'ROUTINE',
    scheduledDate: '2027-06-15',
    timeSlotLabel: '09:00-10:00',
    keyRequired: 'false',
    primaryContactName: 'Jane Smith',
    primaryContactEmail: 'jane.smith@example.com',
    primaryContactPhone: '+61400000001',
    notes: 'Sample row 1',
  });

  sheet.addRow({
    branchName: 'South Branch',
    propertyCode: 'PROP-002',
    serviceTypeCode: 'INGOING',
    scheduledDate: '2027-06-20',
    timeSlotLabel: '14:00-15:00',
    keyRequired: 'true',
    primaryContactName: 'John Doe',
    primaryContactEmail: 'john.doe@example.com',
    primaryContactPhone: '+61400000002',
    notes: 'Sample row 2 — key required',
  });

  const outPath = path.resolve(__dirname, '../public/templates/appointments-import-template.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log('Generated:', outPath);
}

generate().catch((err) => { console.error(err); process.exit(1); });
