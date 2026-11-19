import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, scopedAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';
import type { PurchaseOrderApprovalsService } from '../purchase-order-approvals/purchase-order-approvals.service';
import { todayIst } from './hr-dates';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function linkedUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'UIEPL/HO/004',
    email: null,
    displayName: 'Ravi Kumar',
    isActive: true,
    mustChangePassword: false,
    roles: [],
    ...overrides,
  };
}

const LINKED = { userId: USER_ID, user: { id: USER_ID, username: 'UIEPL/HO/004', isActive: true } };

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

const FIELDS = {
  code: 'UIEPL/HO/004',
  fullName: 'Ravi Kumar',
  designationId: null,
  workLocationType: null,
  projectId: null,
  siteId: null,
  dateOfJoining: null,
  dateOfLeaving: null,
  officialEmail: null,
  mobile: null,
};

const CREATE = { ...FIELDS, companyId: COMPANY_ID };

function setup(lastNumber: number | null = 3) {
  const recorder = new TransactionRecorder();
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ last: lastNumber }]),
    employee: {
      create: recorder.write('employee.create', () => employeeRow()),
      update: recorder.write('employee.update', () => employeeRow()),
    },
    user: {
      findUniqueOrThrow: jest.fn(async () => linkedUserRow()),
      update: recorder.write('user.update', () => linkedUserRow({ username: 'UIEPL/HO/005' })),
    },
    session: { updateMany: recorder.write('session.updateMany', () => ({ count: 1 })) },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    company: { findUnique: jest.fn() },
    designation: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    site: { findUnique: jest.fn() },
    employee: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(recorder.run(tx)),
    user: { findFirst: jest.fn() },
  };
  prisma.company.findUnique.mockResolvedValue({
    id: COMPANY_ID,
    isActive: true,
    emailDomain: 'uniqueinfraengineers.in',
  });
  prisma.employee.findFirst.mockResolvedValue(null);
  prisma.user.findFirst.mockResolvedValue(null);
  const approvals = { reconcileOpenSteps: jest.fn(async () => undefined) };
  const service = new EmployeesService(
    prisma as unknown as PrismaService,
    new AuditService(),
    approvals as unknown as PurchaseOrderApprovalsService,
  );

  return { prisma, tx, recorder, service, approvals };
}

describe('EmployeesService.create', () => {
  it('gives the next Employee No. inside the same transaction as the insert and audit row', async () => {
    const { prisma, tx, recorder, service } = setup(3);

    await service.create(CREATE, ACTOR, globalAccess());

    const data = (tx.employee.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({
      employeeNo: 'EMP-000004',
      code: 'UIEPL/HO/004',
      companyId: COMPANY_ID,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual(['employee.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'Employee', companyId: COMPANY_ID }),
    ]);
  });

  it('refuses a company the user does not manage with INVALID_COMPANY', async () => {
    const { service } = setup();
    const access = scopedAccess('COMPANY', { companyId: OTHER_COMPANY_ID }, [
      'hr.employees.manage',
    ]);

    await expect(codeOf(service.create(CREATE, ACTOR, access))).resolves.toBe('INVALID_COMPANY');
  });

  it('refuses a duplicate code and takes no number', async () => {
    const { prisma, tx, service } = setup();
    prisma.employee.findFirst.mockResolvedValue({ employeeNo: 'EMP-000001' });

    await expect(codeOf(service.create(CREATE, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_EMPLOYEE_CODE',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses an official email outside the company domain', async () => {
    const { service } = setup();

    await expect(
      codeOf(service.create({ ...CREATE, officialEmail: 'ravi@gmail.com' }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_EMAIL_DOMAIN');
  });

  it('refuses a leaving date before the joining date', async () => {
    const { service } = setup();

    await expect(
      codeOf(
        service.create(
          { ...CREATE, dateOfJoining: '2026-05-01', dateOfLeaving: '2026-04-30' },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('INVALID_DATES');
  });

  it('needs a project of the same company when work location is Project', async () => {
    const { prisma, service } = setup();

    await expect(
      codeOf(service.create({ ...CREATE, workLocationType: 'PROJECT' }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_WORK_LOCATION');

    prisma.project.findUnique.mockResolvedValue({ companyId: OTHER_COMPANY_ID, isActive: true });

    await expect(
      codeOf(
        service.create(
          { ...CREATE, workLocationType: 'PROJECT', projectId: PROJECT_ID },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('INVALID_WORK_LOCATION');
  });
});

describe('EmployeesService.update and access', () => {
  it('needs remarks when the employee code changes', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow());

    await expect(
      codeOf(
        service.update(
          EMPLOYEE_ID,
          { ...FIELDS, code: 'UIEPL/HO/005', codeChangeRemarks: null },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('CODE_CHANGE_REMARKS_REQUIRED');
  });

  it('records the code change remarks in the audit row', async () => {
    const { prisma, recorder, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow());

    await service.update(
      EMPLOYEE_ID,
      { ...FIELDS, code: 'UIEPL/HO/005', codeChangeRemarks: 'Typo in import' },
      ACTOR,
      globalAccess(),
    );

    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        after: expect.objectContaining({ codeChangeRemarks: 'Typo in import' }),
      }),
    ]);
  });

  it('hides employees from a project-only holder (OQ-145 a)', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow());
    const access = scopedAccess('PROJECT', { projectId: PROJECT_ID }, ['hr.employees.view']);

    await expect(codeOf(service.get(EMPLOYEE_ID, access))).resolves.toBe('NOT_FOUND');
  });

  it('shows employees to a company holder, view-only', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow());
    const access = scopedAccess('COMPANY', { companyId: COMPANY_ID }, ['hr.employees.view']);

    await expect(service.get(EMPLOYEE_ID, access)).resolves.toMatchObject({
      status: 'ACTIVE',
      canManage: false,
      canCreateUser: false,
    });
  });
});
describe('EmployeesService.update with a linked user', () => {
  it('renames the linked username with the code, in the same transaction (OQ-135)', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow(LINKED));
    tx.employee.update = recorder.write('employee.update', () =>
      employeeRow({ ...LINKED, code: 'UIEPL/HO/005' }),
    );

    await service.update(
      EMPLOYEE_ID,
      { ...FIELDS, code: 'UIEPL/HO/005', codeChangeRemarks: 'Typo in import' },
      ACTOR,
      globalAccess(),
    );

    const data = (tx.user.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({ username: 'UIEPL/HO/005', isActive: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.audit()).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: 'User', action: 'UPDATE' })]),
    );
  });

  it('refuses a code that another user already has as username', async () => {
    const { prisma, service } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow(LINKED));
    prisma.user.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      codeOf(
        service.update(
          EMPLOYEE_ID,
          { ...FIELDS, code: 'UIEPL/HO/005', codeChangeRemarks: 'Typo' },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('USERNAME_TAKEN');
  });

  it('deactivates the linked user and ends sessions when the leaving date is today (OQ-141)', async () => {
    const { prisma, tx, recorder, service, approvals } = setup();
    prisma.employee.findUnique.mockResolvedValue(employeeRow(LINKED));
    tx.user.update = recorder.write('user.update', () => linkedUserRow({ isActive: false }));

    await service.update(
      EMPLOYEE_ID,
      { ...FIELDS, dateOfLeaving: todayIst(), codeChangeRemarks: null },
      ACTOR,
      globalAccess(),
    );

    expect(recorder.tables()).toContain('session.updateMany');
    expect(approvals.reconcileOpenSteps).toHaveBeenCalledTimes(1);
    expect(recorder.audit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'User', action: 'DEACTIVATE' }),
      ]),
    );
  });
});
