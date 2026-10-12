/* eslint-disable @typescript-eslint/no-require-imports */
// Idempotent seed: ADMINISTRATOR role (all permissions), one admin user and the GST state master.
// Reads DIRECT_URL (or DATABASE_URL) and SEED_ADMIN_* from apps/api/.env. Never prints their values.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hash } = require('@node-rs/argon2');
const { ALL_PERMISSIONS } = require('@uie/contracts');
const { resolveDirectUrl } = require('./connection.cjs');
const { STATES } = require('./states-data.cjs');

try {
  process.loadEnvFile('.env');
} catch {
  // Variables may be provided by the environment instead.
}

const ADMIN_ROLE_CODE = 'ADMINISTRATOR';

function required(name) {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

/** Creates missing states and corrects name/isActive of existing ones; never deletes. */
async function seedStates(prisma) {
  let inserted = 0;
  let alreadyExisted = 0;
  let corrected = 0;

  for (const state of STATES) {
    const existing = await prisma.state.findUnique({ where: { gstCode: state.gstCode } });

    if (existing === null) {
      await prisma.state.create({ data: state });
      inserted += 1;
      continue;
    }

    alreadyExisted += 1;

    if (existing.name !== state.name || existing.isActive !== state.isActive) {
      await prisma.state.update({
        where: { id: existing.id },
        data: { name: state.name, isActive: state.isActive },
      });
      corrected += 1;
    }
  }

  return { inserted, alreadyExisted, corrected };
}

async function main() {
  required('DATABASE_URL');
  const connectionString = resolveDirectUrl(process.env);
  const username = required('SEED_ADMIN_USERNAME');
  const email = required('SEED_ADMIN_EMAIL');
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (password === undefined || password.length === 0) {
    throw new Error('Missing required environment variable: SEED_ADMIN_PASSWORD');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existingRole = await prisma.role.findUnique({ where: { code: ADMIN_ROLE_CODE } });
    const role =
      existingRole ??
      (await prisma.role.create({
        data: { code: ADMIN_ROLE_CODE, name: 'Administrator', isSystem: true, isActive: true },
      }));

    await prisma.rolePermission.createMany({
      data: ALL_PERMISSIONS.map((permissionCode) => ({ roleId: role.id, permissionCode })),
      skipDuplicates: true,
    });

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { email: { equals: email, mode: 'insensitive' } },
        ],
      },
    });

    let user = existingUser;
    let userCreated = false;

    if (user === null) {
      user = await prisma.user.create({
        data: {
          username,
          email,
          displayName: 'Administrator',
          passwordHash: await hash(password),
          isActive: true,
          mustChangePassword: true,
        },
      });
      userCreated = true;
    }

    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: role.id }],
      skipDuplicates: true,
    });

    const states = await seedStates(prisma);

    console.log(
      JSON.stringify({
        states,
        role: existingRole === null ? 'created' : 'already existed',
        permissions: ALL_PERMISSIONS.length,
        adminUser: userCreated ? 'created' : 'already existed',
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
