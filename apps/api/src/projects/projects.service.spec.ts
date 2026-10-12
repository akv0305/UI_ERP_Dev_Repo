import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { ProjectsService } from './projects.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STATE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const COMPANY = {
  id: COMPANY_ID,
  code: 'UIE',
  legalName: 'Unique Infra',
  isActive: true,
};
const STATE = { id: STATE_ID, gstCode: '36', name: 'Telangana', isActive: true };

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    companyId: COMPANY_ID,
    company: COMPANY,
    code: 'P1',
    name: 'Project One',
    stateId: null,
    state: null,
    billingGstRegistrationId: null,
    billingGst: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const recorder = new TransactionRecorder();
  const tx = {
    project: {
      create: recorder.write('project.create', () => projectRow()),
      update: recorder.write('project.update', () => projectRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    project: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    company: { findUnique: jest.fn() },
    companyGstRegistration: { findUnique: jest.fn() },
    site: { count: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.project.findFirst.mockResolvedValue(null);
  prisma.project.count.mockResolvedValue(0);
  prisma.project.findMany.mockResolvedValue([]);
  prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: true });
  prisma.site.count.mockResolvedValue(0);
  prisma.state.findUnique.mockResolvedValue(STATE);

  const client = prisma as unknown as PrismaService;
  const service = new ProjectsService(client, new StatesService(client), new AuditService());

  return { prisma, tx, recorder, service };
}

const createRequest = {
  companyId: COMPANY_ID,
  code: 'P1',
  name: 'Project One',
  stateId: null,
  billingGstRegistrationId: null,
};
const updateRequest = {
  companyId: COMPANY_ID,
  name: 'Renamed',
  stateId: null,
  billingGstRegistrationId: null,
};

describe('ProjectsService.create', () => {
  it('creates the project and audits it with the company id, in one transaction', async () => {
    const { prisma, tx, recorder, service } = setup();

    await service.create(createRequest, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: ACTOR, updatedById: ACTOR }) as unknown,
      }),
    );
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'Project',
        entityId: PROJECT_ID,
        companyId: COMPANY_ID,
      }),
    ]);
  });

  it('rejects an inactive company with PARENT_INACTIVE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: false });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('returns NOT_FOUND for an unknown company', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'NOT_FOUND',
    );
  });

  it('rejects a duplicate code within the company, case-insensitively', async () => {
    const { prisma, service } = setup();
    prisma.project.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: COMPANY_ID, code: { equals: 'P1', mode: 'insensitive' } },
      }),
    );
  });

  it('maps a concurrent unique violation to DUPLICATE_CODE', async () => {
    const { tx, service } = setup();
    tx.project.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
  });

  it('writes no audit row when the insert fails', async () => {
    const { tx, recorder, service } = setup();
    tx.project.create.mockRejectedValue(new Error('database down'));

    await expect(service.create(createRequest, ACTOR, globalAccess())).rejects.toThrow(
      'database down',
    );

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(recorder.committed).toEqual([]);
  });
});

describe('ProjectsService billing GST registration', () => {
  const withBilling = { ...createRequest, billingGstRegistrationId: GST_ID };

  it('accepts an active registration of the same company', async () => {
    const { prisma, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      companyId: COMPANY_ID,
      isActive: true,
    });

    await expect(service.create(withBilling, ACTOR, globalAccess())).resolves.toBeDefined();
  });

  it('rejects a registration of another company with INVALID_GST_REGISTRATION', async () => {
    const { prisma, recorder, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      companyId: 'another-company',
      isActive: true,
    });

    await expect(codeOf(service.create(withBilling, ACTOR, globalAccess()))).resolves.toBe(
      'INVALID_GST_REGISTRATION',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('rejects an inactive or unknown registration', async () => {
    const { prisma, service } = setup();

    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      companyId: COMPANY_ID,
      isActive: false,
    });
    await expect(codeOf(service.create(withBilling, ACTOR, globalAccess()))).resolves.toBe(
      'INVALID_GST_REGISTRATION',
    );

    prisma.companyGstRegistration.findUnique.mockResolvedValue(null);
    await expect(codeOf(service.create(withBilling, ACTOR, globalAccess()))).resolves.toBe(
      'INVALID_GST_REGISTRATION',
    );
  });

  it('lets an update keep a registration that was deactivated after it was chosen', async () => {
    const { prisma, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow({ billingGstRegistrationId: GST_ID }));
    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      companyId: COMPANY_ID,
      isActive: false,
    });

    await expect(
      service.update(
        PROJECT_ID,
        { ...updateRequest, billingGstRegistrationId: GST_ID },
        ACTOR,
        globalAccess(),
      ),
    ).resolves.toBeDefined();
  });

  it('validates the registration against the existing project company on update', async () => {
    const { prisma, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow());
    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      companyId: 'another-company',
      isActive: true,
    });

    await expect(
      codeOf(
        service.update(
          PROJECT_ID,
          { ...updateRequest, billingGstRegistrationId: GST_ID },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('INVALID_GST_REGISTRATION');
  });
});

describe('ProjectsService.update', () => {
  it('rejects a changed code with CODE_IMMUTABLE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow());

    await expect(
      codeOf(service.update(PROJECT_ID, { ...updateRequest, code: 'P2' }, ACTOR, globalAccess())),
    ).resolves.toBe('CODE_IMMUTABLE');
    expect(recorder.committed).toEqual([]);
  });

  it('never writes code or companyId, and audits an UPDATE with the company id', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow());

    await service.update(PROJECT_ID, { ...updateRequest, code: 'p1' }, ACTOR, globalAccess());

    const data = (tx.project.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).not.toHaveProperty('code');
    expect(data).not.toHaveProperty('companyId');
    expect(data).toMatchObject({ name: 'Renamed', updatedById: ACTOR });
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'UPDATE', companyId: COMPANY_ID }),
    ]);
  });

  it('returns NOT_FOUND for an unknown project', async () => {
    const { prisma, service } = setup();
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(
      codeOf(service.update(PROJECT_ID, updateRequest, ACTOR, globalAccess())),
    ).resolves.toBe('NOT_FOUND');
  });
});

describe('ProjectsService deactivate and reactivate', () => {
  it('blocks deactivation while active sites exist with HAS_ACTIVE_CHILDREN', async () => {
    const { prisma, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow());
    prisma.site.count.mockResolvedValue(1);

    await expect(codeOf(service.deactivate(PROJECT_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
    expect(prisma.site.count).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, isActive: true },
    });
    expect(recorder.committed).toEqual([]);
  });

  it('deactivates when no active site exists and audits DEACTIVATE', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow());
    tx.project.update.mockImplementation(async () => projectRow({ isActive: false }));

    const result = await service.deactivate(PROJECT_ID, ACTOR, globalAccess());

    expect(result.isActive).toBe(false);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'DEACTIVATE', companyId: COMPANY_ID }),
    ]);
  });

  it('refuses reactivation under an inactive company with PARENT_INACTIVE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(
      projectRow({ isActive: false, company: { ...COMPANY, isActive: false } }),
    );

    await expect(codeOf(service.reactivate(PROJECT_ID, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('reactivates under an active company and audits REACTIVATE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.project.findUnique.mockResolvedValue(projectRow({ isActive: false }));

    await service.reactivate(PROJECT_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'REACTIVATE' })]);
  });
});

describe('ProjectsService.list', () => {
  it('filters by company, status and search', async () => {
    const { prisma, service } = setup();

    await service.list(
      {
        page: 1,
        pageSize: 20,
        search: 'metro',
        isActive: 'true',
        companyId: COMPANY_ID,
        sortBy: 'name',
        sortDir: 'asc',
      },
      globalAccess(),
    );

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          companyId: COMPANY_ID,
          OR: [
            { code: { contains: 'metro', mode: 'insensitive' } },
            { name: { contains: 'metro', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
});
