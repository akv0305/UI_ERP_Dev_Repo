import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { GstRegistrationsService } from '../companies/gst-registrations.service';
import { ProjectsService } from '../projects/projects.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { StoresService } from '../sites/stores.service';
import { StatesService } from '../states/states.service';
import {
  codeOf,
  globalAccess,
  scopedAccess,
  TransactionRecorder,
  type Hierarchy,
} from './test-harness';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const P1 = 'a1111111-1111-4111-8111-111111111111';
const P2 = 'a2222222-2222-4222-8222-222222222222';
const P3 = 'a3333333-3333-4333-8333-333333333333';
const S1 = 'b1111111-1111-4111-8111-111111111111';
const S2 = 'b2222222-2222-4222-8222-222222222222';
const T1 = 'd1111111-1111-4111-8111-111111111111';
const G1 = 'e1111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00Z');

// C1 > P1 > S1 > T1 ; C1 > P2 > S2 ; C2 > P3
const HIERARCHY: Hierarchy = {
  projectCompany: { [P1]: C1, [P2]: C1, [P3]: C2 },
  siteProject: { [S1]: P1, [S2]: P2 },
  storeSite: { [T1]: S1 },
};

const VIEW_ALL = [
  'masters.companies.view',
  'masters.projects.view',
  'masters.sitesAndStores.view',
] as const;
const MANAGE_ALL = [
  'masters.companies.manage',
  'masters.projects.manage',
  'masters.sitesAndStores.manage',
] as const;

const company = (id: string, code: string) => ({
  id,
  code,
  legalName: `${code} Ltd`,
  entityType: 'COMPANY',
  pan: null,
  tan: null,
  cin: null,
  llpin: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateId: null,
  state: null,
  pinCode: null,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  createdById: ACTOR,
  updatedById: ACTOR,
});
const project = (id: string, companyId: string, code: string) => ({
  id,
  companyId,
  code,
  name: `${code} name`,
  stateId: null,
  state: null,
  billingGstRegistrationId: null,
  billingGst: null,
  company: company(companyId, companyId === C1 ? 'C1' : 'C2'),
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  createdById: ACTOR,
  updatedById: ACTOR,
});
const site = (id: string, projectId: string, code: string) => ({
  id,
  projectId,
  code,
  name: `${code} name`,
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateId: null,
  state: null,
  pinCode: null,
  contactPerson: null,
  contactPhone: null,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  createdById: ACTOR,
  updatedById: ACTOR,
  project: project(projectId, HIERARCHY.projectCompany[projectId] as string, 'PX'),
});
const store = (id: string, siteId: string) => ({
  id,
  siteId,
  code: 'ST1',
  name: 'Store',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  createdById: ACTOR,
  updatedById: ACTOR,
  site: site(siteId, HIERARCHY.siteProject[siteId] as string, 'SX'),
});

function setup() {
  const recorder = new TransactionRecorder();
  const tx = {
    company: {
      create: recorder.write('company.create', () => company(C1, 'C1')),
      update: recorder.write('company.update', () => company(C1, 'C1')),
    },
    companyGstRegistration: {
      create: recorder.write('registration.create'),
      update: recorder.write('registration.update'),
    },
    project: {
      create: recorder.write('project.create', () => project(P1, C1, 'P1')),
      update: recorder.write('project.update', () => project(P1, C1, 'P1')),
    },
    site: {
      create: recorder.write('site.create', () => site(S1, P1, 'S1')),
      update: recorder.write('site.update', () => site(S1, P1, 'S1')),
    },
    store: {
      create: recorder.write('store.create', () => store(T1, S1)),
      update: recorder.write('store.update', () => store(T1, S1)),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    company: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    project: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    site: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    store: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    companyGstRegistration: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };

  prisma.company.findFirst.mockResolvedValue(null);
  prisma.company.findMany.mockResolvedValue([]);
  prisma.company.count.mockResolvedValue(0);
  prisma.project.findFirst.mockResolvedValue(null);
  prisma.project.findMany.mockResolvedValue([]);
  prisma.project.count.mockResolvedValue(0);
  prisma.site.findFirst.mockResolvedValue(null);
  prisma.site.findMany.mockResolvedValue([]);
  prisma.site.count.mockResolvedValue(0);
  prisma.store.findFirst.mockResolvedValue(null);
  prisma.store.findMany.mockResolvedValue([]);
  prisma.companyGstRegistration.findMany.mockResolvedValue([]);

  const client = prisma as unknown as PrismaService;
  const audit = new AuditService();
  const states = new StatesService(client);

  return {
    prisma,
    recorder,
    companies: new CompaniesService(client, states, audit),
    registrations: new GstRegistrationsService(client, states, audit),
    projects: new ProjectsService(client, states, audit),
    sites: new SitesService(client, states, audit),
    stores: new StoresService(client, audit),
  };
}

const listQuery = { page: 1, pageSize: 20, sortDir: 'asc' as const };

async function statusOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { getStatus?: () => number }).getStatus?.().toString() ?? 'error';
  }
}

describe('Company scope', () => {
  const create = {
    code: 'NEW',
    legalName: 'New Co',
    entityType: 'COMPANY' as const,
    pan: null,
    tan: null,
    cin: null,
    llpin: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateId: null,
    pinCode: null,
  };

  it('create needs masters.companies.manage GLOBAL: allowed for a global holder', async () => {
    const { companies } = setup();

    await expect(companies.create(create, ACTOR, globalAccess())).resolves.toBeDefined();
  });

  it('create is 403 for a company-scoped manager (a new company has no parent to scope to)', async () => {
    const { companies, prisma } = setup();
    const access = scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY);

    await expect(codeOf(companies.create(create, ACTOR, access))).resolves.toBe('FORBIDDEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('update is allowed over an in-scope company, 404 over another, 403 when only view is held', async () => {
    const { companies, prisma } = setup();

    prisma.company.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return company(id, id === C1 ? 'C1' : 'C2');
    });

    const manage = scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY);
    const viewOnly = scopedAccess('COMPANY', { companyId: C1 }, VIEW_ALL, HIERARCHY);
    const body = { ...create, code: undefined };

    await expect(companies.update(C1, body, ACTOR, manage)).resolves.toBeDefined();
    await expect(codeOf(companies.update(C2, body, ACTOR, manage))).resolves.toBe('NOT_FOUND');
    await expect(codeOf(companies.update(C1, body, ACTOR, viewOnly))).resolves.toBe('FORBIDDEN');
    await expect(codeOf(companies.deactivate(C2, ACTOR, manage))).resolves.toBe('NOT_FOUND');
    await expect(codeOf(companies.reactivate(C1, ACTOR, viewOnly))).resolves.toBe('FORBIDDEN');
  });

  it('detail of an out-of-scope company is 404 (existence is not revealed)', async () => {
    const { companies, prisma } = setup();

    prisma.company.findUnique.mockResolvedValue({ ...company(C2, 'C2'), gstRegistrations: [] });
    const access = scopedAccess('COMPANY', { companyId: C1 }, VIEW_ALL, HIERARCHY);

    await expect(codeOf(companies.get(C2, access))).resolves.toBe('NOT_FOUND');
  });

  it('detail carries canManage', async () => {
    const { companies, prisma } = setup();

    prisma.company.findUnique.mockResolvedValue({ ...company(C1, 'C1'), gstRegistrations: [] });

    const viewer = scopedAccess('COMPANY', { companyId: C1 }, VIEW_ALL, HIERARCHY);
    const manager = scopedAccess(
      'COMPANY',
      { companyId: C1 },
      [...VIEW_ALL, ...MANAGE_ALL],
      HIERARCHY,
    );

    await expect(companies.get(C1, viewer)).resolves.toMatchObject({ canManage: false });
    await expect(companies.get(C1, manager)).resolves.toMatchObject({ canManage: true });
  });

  it('list is filtered to covered companies and rows carry canManage', async () => {
    const { companies, prisma } = setup();

    prisma.company.findMany.mockResolvedValue([company(C1, 'C1')]);
    const access = scopedAccess(
      'COMPANY',
      { companyId: C1 },
      [...VIEW_ALL, ...MANAGE_ALL],
      HIERARCHY,
    );

    const result = await companies.list(listQuery as never, access);

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [C1] } } }),
    );
    expect(result.items[0]?.canManage).toBe(true);
  });

  it('list is unfiltered for a global holder', async () => {
    const { companies, prisma } = setup();

    await companies.list(listQuery as never, globalAccess());

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: undefined } }),
    );
  });

  it('GST registrations follow the company scope (create, update, deactivate)', async () => {
    const { registrations, prisma } = setup();
    const request = {
      stateId: 'f1111111-1111-4111-8111-111111111111',
      gstin: '36AABCU3675K1ZV',
      registrationType: 'REGULAR' as const,
      effectiveFrom: null,
      addressLine1: 'a',
      addressLine2: null,
      city: 'c',
      pinCode: '500001',
    };

    prisma.company.findUnique.mockResolvedValue({ id: C2, pan: null });
    prisma.companyGstRegistration.findUnique.mockResolvedValue({
      id: G1,
      companyId: C2,
      isActive: true,
      state: { id: 's', gstCode: '36', name: 'T', isActive: true },
    });
    const manager = scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY);

    await expect(codeOf(registrations.create(C2, request, ACTOR, manager))).resolves.toBe(
      'NOT_FOUND',
    );
    await expect(codeOf(registrations.update(G1, request, ACTOR, manager))).resolves.toBe(
      'NOT_FOUND',
    );
    await expect(codeOf(registrations.deactivate(G1, ACTOR, manager))).resolves.toBe('NOT_FOUND');
  });
});

describe('Project scope', () => {
  const create = {
    companyId: C1,
    code: 'NEW',
    name: 'New',
    stateId: null,
    billingGstRegistrationId: null,
  };

  it('create needs manage over the parent company: ok in scope, 403 outside, nothing written outside', async () => {
    const { projects, prisma } = setup();

    prisma.company.findUnique.mockResolvedValue({ id: C1, isActive: true });
    const inScope = scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY);
    const otherCompany = scopedAccess('COMPANY', { companyId: C2 }, MANAGE_ALL, HIERARCHY);

    await expect(projects.create(create, ACTOR, inScope)).resolves.toBeDefined();
    await expect(codeOf(projects.create(create, ACTOR, otherCompany))).resolves.toBe('FORBIDDEN');
  });

  it('a project-scoped manager cannot create a project (the parent company is not covered)', async () => {
    const { projects } = setup();
    const access = scopedAccess('PROJECT', { projectId: P1 }, MANAGE_ALL, HIERARCHY);

    await expect(codeOf(projects.create(create, ACTOR, access))).resolves.toBe('FORBIDDEN');
  });

  it('answers an unknown company the same as an out-of-scope one (no existence leak)', async () => {
    const { projects, prisma } = setup();

    prisma.company.findUnique.mockResolvedValue(null);
    const access = scopedAccess('COMPANY', { companyId: C2 }, MANAGE_ALL, HIERARCHY);

    await expect(codeOf(projects.create(create, ACTOR, access))).resolves.toBe('FORBIDDEN');
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
  });

  it('update / deactivate / reactivate: in scope ok, other project 404, view-only 403', async () => {
    const { projects, prisma } = setup();

    prisma.project.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return project(id, HIERARCHY.projectCompany[id] as string, 'PX');
    });
    const manage = scopedAccess('PROJECT', { projectId: P1 }, MANAGE_ALL, HIERARCHY);
    const viewOnly = scopedAccess('PROJECT', { projectId: P1 }, VIEW_ALL, HIERARCHY);
    const body = { name: 'n', stateId: null, billingGstRegistrationId: null };

    await expect(projects.update(P1, body, ACTOR, manage)).resolves.toBeDefined();
    await expect(codeOf(projects.update(P2, body, ACTOR, manage))).resolves.toBe('NOT_FOUND');
    await expect(codeOf(projects.deactivate(P3, ACTOR, manage))).resolves.toBe('NOT_FOUND');
    await expect(codeOf(projects.reactivate(P1, ACTOR, viewOnly))).resolves.toBe('FORBIDDEN');
  });

  it('a company-scoped manager manages every project of that company but none of another', async () => {
    const { projects, prisma } = setup();

    prisma.project.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return project(id, HIERARCHY.projectCompany[id] as string, 'PX');
    });
    const manage = scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY);
    const body = { name: 'n', stateId: null, billingGstRegistrationId: null };

    await expect(projects.update(P1, body, ACTOR, manage)).resolves.toBeDefined();
    await expect(projects.update(P2, body, ACTOR, manage)).resolves.toBeDefined();
    await expect(codeOf(projects.update(P3, body, ACTOR, manage))).resolves.toBe('NOT_FOUND');
  });

  it('detail is 404 out of scope and carries canManage in scope', async () => {
    const { projects, prisma } = setup();

    prisma.project.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return project(id, HIERARCHY.projectCompany[id] as string, 'PX');
    });
    const viewer = scopedAccess('PROJECT', { projectId: P1 }, VIEW_ALL, HIERARCHY);

    await expect(codeOf(projects.get(P3, viewer))).resolves.toBe('NOT_FOUND');
    await expect(projects.get(P1, viewer)).resolves.toMatchObject({ canManage: false });
  });

  it('list is limited to accessible projects; canManage is per row', async () => {
    const { projects, prisma } = setup();

    prisma.project.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { id?: { in: string[] } } }).where;

      return where.id === undefined
        ? []
        : [P1, P2].filter((id) => where.id?.in.includes(id)).map((id) => project(id, C1, id));
    });
    // View over company C1, manage only over project P1.
    const access = scopedAccess('COMPANY', { companyId: C1 }, VIEW_ALL, HIERARCHY);

    const result = await projects.list(listQuery as never, access);

    expect(result.items.map((item) => item.id).sort()).toEqual([P1, P2]);
    expect(result.items.every((item) => !item.canManage)).toBe(true);
  });
});

describe('Site and store scope', () => {
  it('site create needs manage over the parent project', async () => {
    const { sites, prisma } = setup();
    const request = {
      projectId: P1,
      code: 'NEW',
      name: 'n',
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateId: null,
      pinCode: null,
      contactPerson: null,
      contactPhone: null,
    };

    prisma.project.findUnique.mockResolvedValue({ id: P1, isActive: true });
    const projectManager = scopedAccess('PROJECT', { projectId: P1 }, MANAGE_ALL, HIERARCHY);
    const siteManager = scopedAccess('SITE', { siteId: S1 }, MANAGE_ALL, HIERARCHY);
    const otherProject = scopedAccess('PROJECT', { projectId: P2 }, MANAGE_ALL, HIERARCHY);

    await expect(sites.create(request, ACTOR, projectManager)).resolves.toBeDefined();
    await expect(codeOf(sites.create(request, ACTOR, siteManager))).resolves.toBe('FORBIDDEN');
    await expect(codeOf(sites.create(request, ACTOR, otherProject))).resolves.toBe('FORBIDDEN');
  });

  it('site update / deactivate: own site ok, sibling site 404', async () => {
    const { sites, prisma } = setup();

    prisma.site.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return site(id, HIERARCHY.siteProject[id] as string, 'SX');
    });
    const manage = scopedAccess('SITE', { siteId: S1 }, MANAGE_ALL, HIERARCHY);
    const body = {
      name: 'n',
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateId: null,
      pinCode: null,
      contactPerson: null,
      contactPhone: null,
    };

    await expect(sites.update(S1, body, ACTOR, manage)).resolves.toBeDefined();
    await expect(codeOf(sites.update(S2, body, ACTOR, manage))).resolves.toBe('NOT_FOUND');
    await expect(codeOf(sites.deactivate(S2, ACTOR, manage))).resolves.toBe('NOT_FOUND');
  });

  it('store create needs manage over the parent site', async () => {
    const { stores, prisma } = setup();

    prisma.site.findUnique.mockResolvedValue({
      id: S1,
      isActive: true,
      project: { companyId: C1 },
    });
    const siteManager = scopedAccess('SITE', { siteId: S1 }, MANAGE_ALL, HIERARCHY);
    const otherSite = scopedAccess('SITE', { siteId: S2 }, MANAGE_ALL, HIERARCHY);

    await expect(
      stores.create(S1, { code: 'ST9', name: 'n' }, ACTOR, siteManager),
    ).resolves.toBeDefined();
    await expect(
      codeOf(stores.create(S1, { code: 'ST9', name: 'n' }, ACTOR, otherSite)),
    ).resolves.toBe('FORBIDDEN');
  });

  it('store update / deactivate / reactivate follow the site scope (404 out, 403 view-only)', async () => {
    const { stores, prisma } = setup();

    prisma.store.findUnique.mockResolvedValue(store(T1, S1));
    const manage = scopedAccess('PROJECT', { projectId: P1 }, MANAGE_ALL, HIERARCHY);
    const viewOnly = scopedAccess('PROJECT', { projectId: P1 }, VIEW_ALL, HIERARCHY);
    const outside = scopedAccess('PROJECT', { projectId: P2 }, MANAGE_ALL, HIERARCHY);

    await expect(stores.update(T1, { name: 'n' }, ACTOR, manage)).resolves.toBeDefined();
    await expect(codeOf(stores.update(T1, { name: 'n' }, ACTOR, outside))).resolves.toBe(
      'NOT_FOUND',
    );
    await expect(codeOf(stores.deactivate(T1, ACTOR, viewOnly))).resolves.toBe('FORBIDDEN');
    await expect(codeOf(stores.reactivate(T1, ACTOR, outside))).resolves.toBe('NOT_FOUND');
  });

  it('listing the stores of an out-of-scope site is 404; in scope rows carry canManage', async () => {
    const { stores, prisma } = setup();

    prisma.site.findUnique.mockImplementation(async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;

      return { id, projectId: HIERARCHY.siteProject[id], project: { companyId: C1 } };
    });
    prisma.store.findMany.mockResolvedValue([store(T1, S1)]);
    const viewer = scopedAccess('SITE', { siteId: S1 }, VIEW_ALL, HIERARCHY);

    await expect(codeOf(stores.listForSite(S2, viewer))).resolves.toBe('NOT_FOUND');
    await expect(stores.listForSite(S1, viewer)).resolves.toMatchObject({
      items: [{ canManage: false }],
    });
  });

  it('site list is limited to accessible sites; canManage per row', async () => {
    const { sites, prisma } = setup();

    prisma.site.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { id?: { in: string[] } } }).where;

      return [S1, S2]
        .filter((id) => where.id === undefined || where.id.in.includes(id))
        .map((id) => site(id, HIERARCHY.siteProject[id] as string, id));
    });
    const access = scopedAccess('SITE', { siteId: S1 }, [...VIEW_ALL, ...MANAGE_ALL], HIERARCHY);

    const result = await sites.list(listQuery as never, access);

    expect(result.items.map((item) => item.id)).toEqual([S1]);
    expect(result.items[0]?.canManage).toBe(true);
  });
});

describe('Option endpoints', () => {
  it('company options (project form): only active companies the user may create a project under', async () => {
    const { companies, prisma } = setup();

    prisma.company.findMany.mockResolvedValue([company(C1, 'C1')]);
    const access = scopedAccess(
      'COMPANY',
      { companyId: C1 },
      ['masters.projects.manage'],
      HIERARCHY,
    );

    const result = await companies.optionsForProjects(access);

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: { in: [C1] } } }),
    );
    expect(result.items).toEqual([{ id: C1, label: 'C1 — C1 Ltd' }]);
  });

  it('company options are empty for a user whose project-manage covers no company (project scope)', async () => {
    const { companies, prisma } = setup();
    const access = scopedAccess(
      'PROJECT',
      { projectId: P1 },
      ['masters.projects.manage'],
      HIERARCHY,
    );

    await companies.optionsForProjects(access);

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: { in: [] } } }),
    );
  });

  it('company options need no companies.view: a user with only projects.manage still gets them', async () => {
    const { companies, prisma } = setup();

    prisma.company.findMany.mockResolvedValue([company(C1, 'C1')]);

    await expect(
      companies.optionsForProjects(
        scopedAccess('COMPANY', { companyId: C1 }, ['masters.projects.manage'], HIERARCHY),
      ),
    ).resolves.toMatchObject({ items: [{ id: C1 }] });
  });

  it('project options (site form): active projects covered by sitesAndStores.manage', async () => {
    const { projects, prisma } = setup();

    prisma.project.findMany.mockResolvedValue([project(P1, C1, 'P1')]);
    const access = scopedAccess(
      'PROJECT',
      { projectId: P1 },
      ['masters.sitesAndStores.manage'],
      HIERARCHY,
    );

    const result = await projects.optionsForSites(access);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: { in: [P1] } } }),
    );
    expect(result.items).toEqual([{ id: P1, label: 'P1 — P1 name', companyId: C1 }]);
  });

  it('site options (store form): active sites covered by sitesAndStores.manage, unrestricted for global', async () => {
    const { sites, prisma } = setup();

    prisma.site.findMany.mockResolvedValue([site(S1, P1, 'S1')]);

    await sites.optionsForStores(globalAccess());

    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: undefined } }),
    );

    await sites.optionsForStores(
      scopedAccess('SITE', { siteId: S1 }, ['masters.sitesAndStores.manage'], HIERARCHY),
    );

    expect(prisma.site.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { isActive: true, id: { in: [S1] } } }),
    );
  });

  it('GST registration options need projects.manage over the company: in scope lists active GSTINs, out of scope is 404', async () => {
    const { registrations, prisma } = setup();

    prisma.company.findUnique.mockImplementation(async (args: unknown) => ({
      id: (args as { where: { id: string } }).where.id,
    }));
    prisma.companyGstRegistration.findMany.mockResolvedValue([
      { id: G1, gstin: '36AABCU3675K1ZV' },
    ]);
    const access = scopedAccess(
      'COMPANY',
      { companyId: C1 },
      ['masters.projects.manage'],
      HIERARCHY,
    );

    await expect(registrations.optionsForProject(C1, access)).resolves.toEqual({
      items: [{ id: G1, label: '36AABCU3675K1ZV' }],
    });
    expect(prisma.companyGstRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: C1, isActive: true } }),
    );
    await expect(codeOf(registrations.optionsForProject(C2, access))).resolves.toBe('NOT_FOUND');
  });
});

describe('every write stays audited in its own transaction (scope checks do not skip it)', () => {
  it('a scoped project create writes the project and its audit row together', async () => {
    const { projects, prisma, recorder } = setup();

    prisma.company.findUnique.mockResolvedValue({ id: C1, isActive: true });
    await projects.create(
      { companyId: C1, code: 'NEW', name: 'n', stateId: null, billingGstRegistrationId: null },
      ACTOR,
      scopedAccess('COMPANY', { companyId: C1 }, MANAGE_ALL, HIERARCHY),
    );

    expect(recorder.tables()).toEqual(['project.create', 'auditEvent.create']);
  });

  it('a refused scoped write writes nothing at all', async () => {
    const { projects, recorder } = setup();

    await statusOf(
      projects.create(
        { companyId: C1, code: 'NEW', name: 'n', stateId: null, billingGstRegistrationId: null },
        ACTOR,
        scopedAccess('COMPANY', { companyId: C2 }, MANAGE_ALL, HIERARCHY),
      ),
    );

    expect(recorder.tables()).toEqual([]);
  });
});
