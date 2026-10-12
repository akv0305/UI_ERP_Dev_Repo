import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { SitesService } from './sites.service';
import { StoresService } from './stores.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STORE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const COMPANY = { id: COMPANY_ID, code: 'UIE', legalName: 'Unique Infra', isActive: true };
const PROJECT = {
  id: PROJECT_ID,
  companyId: COMPANY_ID,
  company: COMPANY,
  code: 'P1',
  name: 'Project One',
  isActive: true,
};

function siteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SITE_ID,
    projectId: PROJECT_ID,
    project: PROJECT,
    code: 'S1',
    name: 'Site One',
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateId: null,
    state: null,
    pinCode: null,
    contactPerson: null,
    contactPhone: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ID,
    siteId: SITE_ID,
    site: siteRow(),
    code: 'ST1',
    name: 'Main Store',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const recorder = new TransactionRecorder();
  const tx = {
    site: {
      create: recorder.write('site.create', () => siteRow()),
      update: recorder.write('site.update', () => siteRow()),
    },
    store: {
      create: recorder.write('store.create', () => storeRow()),
      update: recorder.write('store.update', () => storeRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    project: { findUnique: jest.fn() },
    site: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    store: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, isActive: true });
  prisma.site.findFirst.mockResolvedValue(null);
  prisma.site.count.mockResolvedValue(0);
  prisma.site.findMany.mockResolvedValue([]);
  prisma.store.findFirst.mockResolvedValue(null);
  prisma.store.count.mockResolvedValue(0);
  prisma.store.findMany.mockResolvedValue([]);

  const client = prisma as unknown as PrismaService;
  const audit = new AuditService();

  return {
    prisma,
    tx,
    recorder,
    sites: new SitesService(client, new StatesService(client), audit),
    stores: new StoresService(client, audit),
  };
}

const siteCreate = {
  projectId: PROJECT_ID,
  code: 'S1',
  name: 'Site One',
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateId: null,
  pinCode: null,
  contactPerson: null,
  contactPhone: null,
};
const { projectId: _projectId, code: _code, ...siteUpdate } = siteCreate;

describe('SitesService.create', () => {
  it('creates the site and audits it with the project company id', async () => {
    const { prisma, recorder, sites } = setup();

    await sites.create(siteCreate, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'Site',
        entityId: SITE_ID,
        companyId: COMPANY_ID,
      }),
    ]);
  });

  it('rejects an inactive project with PARENT_INACTIVE', async () => {
    const { prisma, recorder, sites } = setup();
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, isActive: false });

    await expect(codeOf(sites.create(siteCreate, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('rejects a duplicate code within the project, case-insensitively', async () => {
    const { prisma, sites } = setup();
    prisma.site.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(sites.create(siteCreate, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
    expect(prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID, code: { equals: 'S1', mode: 'insensitive' } },
      }),
    );
  });

  it('writes no audit row when the insert fails', async () => {
    const { tx, recorder, sites } = setup();
    tx.site.create.mockRejectedValue(new Error('database down'));

    await expect(sites.create(siteCreate, ACTOR, globalAccess())).rejects.toThrow('database down');

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(recorder.committed).toEqual([]);
  });
});

describe('SitesService.update', () => {
  it('rejects a changed code with CODE_IMMUTABLE', async () => {
    const { prisma, sites } = setup();
    prisma.site.findUnique.mockResolvedValue(siteRow());

    await expect(
      codeOf(sites.update(SITE_ID, { ...siteUpdate, code: 'S2' }, ACTOR, globalAccess())),
    ).resolves.toBe('CODE_IMMUTABLE');
  });

  it('never writes code or projectId and audits an UPDATE', async () => {
    const { prisma, tx, recorder, sites } = setup();
    prisma.site.findUnique.mockResolvedValue(siteRow());

    await sites.update(
      SITE_ID,
      { ...siteUpdate, code: 's1', name: 'Renamed' },
      ACTOR,
      globalAccess(),
    );

    const data = (tx.site.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).not.toHaveProperty('code');
    expect(data).not.toHaveProperty('projectId');
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'UPDATE', companyId: COMPANY_ID }),
    ]);
  });
});

describe('SitesService deactivate and reactivate', () => {
  it('blocks deactivation while active stores exist with HAS_ACTIVE_CHILDREN', async () => {
    const { prisma, recorder, sites } = setup();
    prisma.site.findUnique.mockResolvedValue(siteRow());
    prisma.store.count.mockResolvedValue(3);

    await expect(codeOf(sites.deactivate(SITE_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
    expect(prisma.store.count).toHaveBeenCalledWith({
      where: { siteId: SITE_ID, isActive: true },
    });
    expect(recorder.committed).toEqual([]);
  });

  it('deactivates and audits DEACTIVATE when no store is active', async () => {
    const { prisma, tx, recorder, sites } = setup();
    prisma.site.findUnique.mockResolvedValue(siteRow());
    tx.site.update.mockImplementation(async () => siteRow({ isActive: false }));

    await sites.deactivate(SITE_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'DEACTIVATE' })]);
  });

  it('refuses reactivation under an inactive project with PARENT_INACTIVE', async () => {
    const { prisma, sites } = setup();
    prisma.site.findUnique.mockResolvedValue(
      siteRow({ isActive: false, project: { ...PROJECT, isActive: false } }),
    );

    await expect(codeOf(sites.reactivate(SITE_ID, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
  });
});

describe('SitesService.list', () => {
  it('filters by project', async () => {
    const { prisma, sites } = setup();

    await sites.list(
      {
        page: 1,
        pageSize: 20,
        projectId: PROJECT_ID,
        sortBy: 'code',
        sortDir: 'asc',
      },
      globalAccess(),
    );

    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: undefined, projectId: PROJECT_ID } }),
    );
  });
});

describe('StoresService.create', () => {
  const request = { code: 'ST1', name: 'Main Store' };

  it('creates the store and audits it with the company id', async () => {
    const { prisma, recorder, stores } = setup();
    prisma.site.findUnique.mockResolvedValue({
      id: SITE_ID,
      isActive: true,
      project: { companyId: COMPANY_ID },
    });

    await stores.create(SITE_ID, request, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'Store',
        entityId: STORE_ID,
        companyId: COMPANY_ID,
      }),
    ]);
  });

  it('rejects an inactive site with PARENT_INACTIVE', async () => {
    const { prisma, recorder, stores } = setup();
    prisma.site.findUnique.mockResolvedValue({
      id: SITE_ID,
      isActive: false,
      project: { companyId: COMPANY_ID },
    });

    await expect(codeOf(stores.create(SITE_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('rejects a duplicate code within the site, case-insensitively', async () => {
    const { prisma, stores } = setup();
    prisma.site.findUnique.mockResolvedValue({
      id: SITE_ID,
      isActive: true,
      project: { companyId: COMPANY_ID },
    });
    prisma.store.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(stores.create(SITE_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
    expect(prisma.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { siteId: SITE_ID, code: { equals: 'ST1', mode: 'insensitive' } },
      }),
    );
  });

  it('returns NOT_FOUND for an unknown site', async () => {
    const { prisma, stores } = setup();
    prisma.site.findUnique.mockResolvedValue(null);

    await expect(codeOf(stores.create(SITE_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'NOT_FOUND',
    );
    await expect(codeOf(stores.listForSite(SITE_ID, globalAccess()))).resolves.toBe('NOT_FOUND');
  });
});

describe('StoresService update, deactivate and reactivate', () => {
  it('rejects a changed code with CODE_IMMUTABLE', async () => {
    const { prisma, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(storeRow());

    await expect(
      codeOf(stores.update(STORE_ID, { code: 'ST2', name: 'Main Store' }, ACTOR, globalAccess())),
    ).resolves.toBe('CODE_IMMUTABLE');
  });

  it('updates only the name and audits an UPDATE with the company id', async () => {
    const { prisma, tx, recorder, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(storeRow());

    await stores.update(STORE_ID, { code: 'st1', name: 'Renamed' }, ACTOR, globalAccess());

    expect(tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Renamed', updatedById: ACTOR } }),
    );
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'UPDATE', companyId: COMPANY_ID }),
    ]);
  });

  it('deactivates and audits DEACTIVATE (stores have no children)', async () => {
    const { prisma, tx, recorder, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(storeRow());
    tx.store.update.mockImplementation(async () => storeRow({ isActive: false }));

    await stores.deactivate(STORE_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'DEACTIVATE' })]);
  });

  it('refuses reactivation under an inactive site with PARENT_INACTIVE', async () => {
    const { prisma, recorder, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(
      storeRow({ isActive: false, site: siteRow({ isActive: false }) }),
    );

    await expect(codeOf(stores.reactivate(STORE_ID, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('reactivates under an active site and audits REACTIVATE', async () => {
    const { prisma, recorder, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(storeRow({ isActive: false }));

    await stores.reactivate(STORE_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'REACTIVATE' })]);
  });

  it('returns NOT_FOUND for an unknown store', async () => {
    const { prisma, stores } = setup();
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(codeOf(stores.deactivate(STORE_ID, ACTOR, globalAccess()))).resolves.toBe(
      'NOT_FOUND',
    );
  });
});
