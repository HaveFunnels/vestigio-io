/**
 * Create a demo organization with Max plan for testing the Nuvemshop integration.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/create-nuvemshop-demo.ts
 *
 * This creates:
 * - Organization "Nuvemshop Demo" with plan=max, orgType=demo, status=active
 * - Environment with domain=vestigiodemostore.lojavirtualnuvem.com.br
 * - Membership linking YOUR admin user as owner
 * - BusinessProfile with ecommerce defaults
 *
 * After running, go to Admin → Organizations → find "Nuvemshop Demo" → Impersonate
 * Then navigate to Settings → Data Sources → Nuvemshop
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@vestigio.io';
const DEMO_DOMAIN = 'vestigiodemostore.lojavirtualnuvem.com.br';

async function main() {
  console.log('Creating Nuvemshop demo environment...\n');

  // 1. Find the admin user
  const adminUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: ADMIN_EMAIL },
        { role: 'ADMIN' },
      ],
    },
  });

  if (!adminUser) {
    console.error(`No admin user found (looked for ${ADMIN_EMAIL} or role=ADMIN)`);
    console.error('Set ADMIN_EMAIL env var to your email address.');
    process.exit(1);
  }

  console.log(`Found admin user: ${adminUser.email} (${adminUser.id})`);

  // 2. Check if org already exists
  const existing = await prisma.organization.findFirst({
    where: { name: 'Nuvemshop Demo' },
  });

  if (existing) {
    console.log(`Organization "Nuvemshop Demo" already exists (${existing.id})`);
    console.log('Skipping creation. Delete it first if you want to recreate.');
    await prisma.$disconnect();
    return;
  }

  // 3. Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Nuvemshop Demo',
      ownerId: adminUser.id,
      plan: 'max',
      status: 'active',
      orgType: 'demo',
    },
  });
  console.log(`Created organization: ${org.name} (${org.id}), plan=max`);

  // 4. Create membership
  await prisma.membership.create({
    data: {
      userId: adminUser.id,
      organizationId: org.id,
      role: 'owner',
    },
  });
  console.log(`Created membership: ${adminUser.email} → owner`);

  // 5. Create environment
  const env = await prisma.environment.create({
    data: {
      organizationId: org.id,
      domain: DEMO_DOMAIN,
      landingUrl: `https://${DEMO_DOMAIN}`,
      isProduction: false,
    },
  });
  console.log(`Created environment: ${DEMO_DOMAIN} (${env.id})`);

  // 6. Create business profile
  await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      businessModel: 'ecommerce',
      conversionModel: 'purchase',
      monthlyRevenue: 50000,
      averageOrderValue: 150,
      monthlyTransactions: 330,
    },
  });
  console.log('Created business profile (ecommerce, R$50k/mo)');

  console.log('\n✓ Done!\n');
  console.log('Next steps:');
  console.log('1. Go to Admin → Organizations → find "Nuvemshop Demo"');
  console.log('2. Click Impersonate to switch to this org');
  console.log('3. Go to Settings → Data Sources → expand Nuvemshop');
  console.log('4. Or test the OAuth flow: install the Vestigio app on the demo Nuvemshop store');
  console.log(`\nEnvironment ID: ${env.id}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
