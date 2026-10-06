/* eslint-disable @typescript-eslint/no-require-imports */
// Idempotent seed: ADMINISTRATOR role (all permissions) and one admin user.
// Reads DIRECT_URL (or DATABASE_URL) and SEED_ADMIN_* from apps/api/.env. Never prints their values.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hash } = require('@node-rs/argon2');
const { ALL_PERMISSIONS } = require('@uie/contracts');
const { resolveDirectUrl } = require('./connection.cjs');

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

    console.log(
      JSON.stringify({
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
