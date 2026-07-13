import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@crossway.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';

  // Check if any users exist
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`Database already has ${count} users. Skipping seed.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: 'Super Admin',
      role: 'super_admin',
      isActive: true,
      emailVerified: true,
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  });

  console.log('----------------------------------------------------');
  console.log('✅ Database seeded successfully!');
  console.log(`Admin Email: ${admin.email}`);
  console.log(`Admin Password: ${adminPassword}`);
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });