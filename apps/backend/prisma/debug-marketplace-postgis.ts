import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Inspector data
  const insp = await prisma.inspector.findFirst({ where: { email: 'insp@pedroalvs.com' } });
  if (!insp) { console.log('Inspector not found!'); return; }
  console.log('Inspector:', insp.id);
  console.log('  status:', insp.status);
  console.log('  serviceTypes:', JSON.stringify(insp.service_types_json));
  console.log('  eligibility:', JSON.stringify(insp.client_eligibility_json));

  // 2. Inspector regions
  const regions = await prisma.inspectorRegion.findMany({ where: { inspector_id: insp.id } });
  console.log('  regions assigned:', regions.length, regions.map(r => r.region_id));

  // 3. Service regions
  const allRegions = await prisma.serviceRegion.findMany();
  console.log('\nService regions:', allRegions.length);
  for (const r of allRegions) {
    console.log('  ', r.id, r.name, r.status);
  }

  // 4. Properties with coordinates
  const propsWithCoords = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, suburb, lat, lng, coordinates IS NOT NULL as has_geom FROM properties WHERE deleted_at IS NULL`
  );
  console.log('\nProperties:', propsWithCoords.length);
  for (const p of propsWithCoords) {
    console.log('  ', p.id, p.suburb, 'lat:', p.lat, 'lng:', p.lng, 'has_geom:', p.has_geom);
  }

  // 5. Test ST_Contains — which properties are inside inspector's regions
  const containedProps = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.id, p.suburb, sr.name as region_name
    FROM properties p
    JOIN service_regions sr ON ST_Contains(sr.geom, p.coordinates)
    JOIN inspector_regions ir ON ir.region_id = sr.id
    WHERE ir.inspector_id = $1
      AND sr.status = 'ACTIVE'
      AND p.deleted_at IS NULL
      AND p.coordinates IS NOT NULL
  `, insp.id);
  console.log('\nProperties in inspector regions:', containedProps.length);
  for (const p of containedProps) {
    console.log('  ', p.id, p.suburb, '→', p.region_name);
  }

  // 6. Published service groups
  const groups = await prisma.serviceGroup.findMany({
    where: { status: 'PUBLISHED' },
    include: { appointments: { select: { property_id: true } } },
  });
  console.log('\nPublished groups:', groups.length);
  for (const g of groups) {
    console.log('  ', g.id, 'tenant:', g.tenant_id, 'propIds:', g.appointments.map(a => a.property_id));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
