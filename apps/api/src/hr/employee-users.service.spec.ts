import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import type { PasswordService } from '../auth/password.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { EmployeeUsersService } from './employee-users.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    employeeNo: 'EMP-000004',
    code: 'UIEPL/HO/004',
    fullName: 'Ravi Kumar',
    companyId: COMPANY_ID,
    designationId: null,
    workLocationType: null,
    projectId: null,
    siteId: null,
    dateOfJoining: null,
    dateOfLeaving: null,
    officialEmail: null,
    mobile: null,
    userId: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: ACTOR,
    updatedById: ACTOR,
    company: {
      id: COMPANY_ID,
      code: 'UIEPL',
      legalName: 'Unique Infra Engineers Pvt Ltd',
      isActive: true,
    },
    designation: null,
    project: null,
    site: null,
    user: null,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'ravi',
    email: 'ravi@old.in',
    displayName: 'Ravi',
    isActive: true,
    mustChangePassword: false,
    roles: [],
    ...overrides,
  };
}

const LINKED = { userId: USER_ID, user: { id: USER_ID, username: 'UIEPL/HO/004', isActive: true } };

function setup() {
  const recorder = new TransactionRecorder();
  const tx = {
    user: {
      create: recorder.write('user.create', () => userRow({ username: 'UIEPL/HO/004' })),
      update: recorder.write('user.update', () => userRow({ username: 'UIEPL/HO/004' })),
    },
    employee: {
      updateMany: recorder.write('employee.updateMany', () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => employeeRow(LINKED)),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    employee: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.employee.findUnique.mockResolvedValue(employeeRow());
  prisma.employee.findFirst.mockResolvedValue(null);
  prisma.user.findFirst.mockResolvedValue(null);

  const passwords = { hash: jest.fn(async () => 'hashed') };
  const service = new EmployeeUsersService(
    prisma as unknown as PrismaService,
    new AuditService(),
    passwords as unknown as PasswordService,
  );

  return { prisma, tx, recorder, service };
}

describe('EmployeeUsersService.createUser', () => {
  it('creates the user from the employee and links it in one transaction (OQ-137, OQ-148)', async () => {
    const { prisma, tx, recorder, service } = setup();

    await service.createUser(
      EMPLOYEE_ID,
      { temporaryPassword: 'Welcome123' },
      ACTOR,
      globalAccess(),
    );

    const data = (tx.user.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({
      username: 'UIEPL/HO/004',
      displayName: 'Ravi Kumar',
      passwordHash: 'hashed',
      mustChangePassword: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual([
      'user.create',
      'employee.updateMany',
      'auditEvent.create',
      'auditEvent.create',
    ]);
    expect(recorder.audit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'User', action: 'CREATE' }),
        expect.objectContaining({ entityType: 'Employee', action: 'UPDATE' }),
      ]),
    );
  });

  it('refuses an employee who has left', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(
      employeeRow({ dateOfLeaving: new Date('2026-01-01T00:00:00Z') }),
    );

    await expect(
      codeOf(
        service.createUser(EMPLOYEE_ID, { temporaryPassword: 'Welcome123' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('EMPLOYEE_NOT_ACTIVE');
  });

  it('refuses an employee who already has a user', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow(LINKED));

    await expect(
      codeOf(
        service.createUser(EMPLOYEE_ID, { temporaryPassword: 'Welcome123' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('USER_ALREADY_LINKED');
  });

  it('refuses when another user already has the code as username, writing nothing', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      codeOf(
        service.createUser(EMPLOYEE_ID, { temporaryPassword: 'Welcome123' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('USERNAME_TAKEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('EmployeeUsersService.linkUser', () => {
  it('never links an administrator (OQ-149)', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(
      userRow({ roles: [{ role: { code: 'ADMINISTRATOR' } }] }),
    );

    await expect(
      codeOf(service.linkUser(EMPLOYEE_ID, { userId: USER_ID }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_USER');
  });

  it('renames the user to the code and keeps its email when no official email (OQ-149)', async () => {
    const { prisma, tx, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await service.linkUser(EMPLOYEE_ID, { userId: USER_ID }, ACTOR, globalAccess());

    const data = (tx.user.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({
      username: 'UIEPL/HO/004',
      displayName: 'Ravi Kumar',
      email: 'ravi@old.in',
    });
  });

  it('refuses a user already linked to another employee', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.employee.findFirst.mockResolvedValue({ id: 'other-employee' });

    await expect(
      codeOf(service.linkUser(EMPLOYEE_ID, { userId: USER_ID }, ACTOR, globalAccess())),
    ).resolves.toBe('USER_ALREADY_LINKED');
  });
});
