import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { ApprovalWorkflowsService, toMoney } from './approval-workflows.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PM_ROLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VP_ROLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OLD_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NEW_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const PM = { id: PM_ROLE, code: 'PURCHASE_MANAGER', name: 'Purchase Manager', isActive: true };
const VP = { id: VP_ROLE, code: 'VP', name: 'Vice President', isActive: true };

function workflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NEW_ID,
    documentType: 'PURCHASE_ORDER',
    companyId: null,
    version: 1,
    isCurrent: true,
    remarks: null,
    createdAt: new Date('2026-11-05T10:00:00Z'),
    createdById: ACTOR,
    ...overrides,
  };
}

function setup(previousVersion: number | null = null) {
  const recorder = new TransactionRecorder();
  const nextVersion = (previousVersion ?? 0) + 1;
  const tx = {
    approvalWorkflow: {
      findFirst: jest.fn(),
      update: recorder.write('approvalWorkflow.update'),
      create: recorder.write('approvalWorkflow.create', () =>
        workflowRow({ version: nextVersion }),
      ),
    },
    approvalWorkflowLevel: { createMany: recorder.write('approvalWorkflowLevel.createMany') },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  tx.approvalWorkflow.findFirst.mockResolvedValue(
    previousVersion === null ? null : workflowRow({ id: OLD_ID, version: previousVersion }),
  );

  const prisma = {
    role: { findMany: jest.fn() },
    company: { findUnique: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.role.findMany.mockResolvedValue([PM, VP]);
  prisma.company.findUnique.mockResolvedValue({
    id: COMPANY_ID,
    code: 'UIEPL',
    legalName: 'Unique Infra Engineers Pvt Ltd',
    isActive: true,
  });
  prisma.user.findUniqueOrThrow.mockResolvedValue({ id: ACTOR, displayName: 'Admin' });

  const service = new ApprovalWorkflowsService(
    prisma as unknown as PrismaService,
    new AuditService(),
  );

  return { prisma, tx, recorder, service };
}

const request = {
  documentType: 'PURCHASE_ORDER' as const,
  companyId: null,
  remarks: null,
  levels: [
    { roleId: PM_ROLE, minAmount: '0', makerCountsAsApproved: true },
    { roleId: VP_ROLE, minAmount: '200000', makerCountsAsApproved: false },
  ],
};

describe('toMoney', () => {
  it('pads to two decimals and drops leading zeros', () => {
    expect(toMoney('0')).toBe('0.00');
    expect(toMoney('200000')).toBe('200000.00');
    expect(toMoney('007.5')).toBe('7.50');
  });
});

describe('ApprovalWorkflowsService.save', () => {
  it('creates version 1 with numbered levels and audits CREATE in one transaction', async () => {
    const { prisma, tx, recorder, service } = setup();

    const result = await service.save(request, ACTOR);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual([
      'approvalWorkflow.create',
      'approvalWorkflowLevel.createMany',
      'auditEvent.create',
    ]);
    expect(tx.approvalWorkflowLevel.createMany).toHaveBeenCalledWith({
      data: [
        {
          levelNo: 1,
          roleId: PM_ROLE,
          minAmount: '0.00',
          makerCountsAsApproved: true,
          workflowId: NEW_ID,
        },
        {
          levelNo: 2,
          roleId: VP_ROLE,
          minAmount: '200000.00',
          makerCountsAsApproved: false,
          workflowId: NEW_ID,
        },
      ],
    });
    expect(result.version).toBe(1);
    expect(result.levels.map((level) => level.role.code)).toEqual(['PURCHASE_MANAGER', 'VP']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'ApprovalWorkflow',
        entityId: NEW_ID,
      }),
    ]);
  });

  it('retires the current version and creates the next one', async () => {
    const { recorder, service } = setup(1);

    const result = await service.save(request, ACTOR);

    expect(result.version).toBe(2);
    expect(recorder.tables()).toEqual([
      'approvalWorkflow.update',
      'approvalWorkflow.create',
      'approvalWorkflowLevel.createMany',
      'auditEvent.create',
      'auditEvent.create',
    ]);
    expect(recorder.audit().map((event) => event.action)).toEqual(['UPDATE', 'CREATE']);
  });

  it('refuses an inactive role with INVALID_ROLE and writes nothing', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([PM, { ...VP, isActive: false }]);

    await expect(codeOf(service.save(request, ACTOR))).resolves.toBe('INVALID_ROLE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses the ADMINISTRATOR role as a level (OQ-106)', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([PM, { ...VP, code: 'ADMINISTRATOR' }]);

    await expect(codeOf(service.save(request, ACTOR))).resolves.toBe('INVALID_ROLE');
  });

  it('refuses an inactive company override with INVALID_COMPANY', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue({
      id: COMPANY_ID,
      code: 'UIEPL',
      legalName: 'Unique Infra Engineers Pvt Ltd',
      isActive: false,
    });

    await expect(codeOf(service.save({ ...request, companyId: COMPANY_ID }, ACTOR))).resolves.toBe(
      'INVALID_COMPANY',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a concurrent save (unique index) to WORKFLOW_CHANGED', async () => {
    const { tx, service } = setup();
    tx.approvalWorkflow.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(codeOf(service.save(request, ACTOR))).resolves.toBe('WORKFLOW_CHANGED');
  });
});
