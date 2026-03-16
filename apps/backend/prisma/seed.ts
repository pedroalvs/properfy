import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Admin Master user
  const passwordHash = await bcrypt.hash('Admin@1234', 12);
  const am = await prisma.user.upsert({
    where: { email: 'admin@properfy.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenant_id: null,
      branch_id: null,
      role: 'AM',
      name: 'Admin Master',
      email: 'admin@properfy.com',
      status: 'ACTIVE',
      password_hash: passwordHash,
      totp_enabled: false,
    },
  });

  console.log(`Created AM user: ${am.email}`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
