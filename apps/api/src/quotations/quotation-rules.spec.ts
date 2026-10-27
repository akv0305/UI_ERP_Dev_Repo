import { AccessContext, type AccessAssignment, type AccessLookup } from '../access/access-context';
import { quotationFlagsFor } from './quotation-rules';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PROJECT_A = '22222222-2222-4222-8222-222222222222';
const PROJECT_B = '33333333-3333-4333-8333-333333333333';
const SITE = '44444444-4444-4444-8444-444444444444';

const lookup: AccessLookup = {
  projectsOfCompanies: () => Promise.resolve([]),
  sitesOfProjects: () => Promise.resolve([]),
  companiesOfProjects: () => Promise.resolve([]),
  projectsOfSites: () => Promise.resolve([]),
  companyOfProject: () => Promise.resolve(null),
  parentsOfSite: () => Promise.resolve(null),
  parentsOfStore: () => Promise.resolve(null),
};

function accessOnProject(projectId: string, permissions: string[]): AccessContext {
  const assignment: AccessAssignment = {
    scopeType: 'PROJECT',
    companyId: null,
    projectId,
    siteId: null,
    role: { code: 'PURCHASE_OFFICER', isActive: true, permissions },
  };

  return new AccessContext([assignment], lookup);
}

const sent = { status: 'SENT' as const };
const base = { companyId: COMPANY, projectId: PROJECT_A, siteId: SITE, enquiry: sent };

describe('quotationFlagsFor', () => {
  const access = accessOnProject(PROJECT_A, ['purchase.quotations.manage']);

  it('lets a manager edit and cancel a draft', () => {
    expect(quotationFlagsFor(access, { ...base, status: 'DRAFT' }, false)).toEqual({
      canEdit: true,
      canRevise: false,
      canCancel: true,
    });
  });

  it('lets a manager revise or cancel a submitted quotation', () => {
    expect(quotationFlagsFor(access, { ...base, status: 'SUBMITTED' }, false)).toEqual({
      canEdit: false,
      canRevise: true,
      canCancel: true,
    });
  });

  it('no revise while a draft revision exists or once the enquiry is closed', () => {
    expect(quotationFlagsFor(access, { ...base, status: 'SUBMITTED' }, true).canRevise).toBe(false);
    expect(
      quotationFlagsFor(
        access,
        { ...base, status: 'SUBMITTED', enquiry: { status: 'CLOSED' } },
        false,
      ).canRevise,
    ).toBe(false);
  });

  it('allows nothing on superseded, on another project or with view only', () => {
    const other = accessOnProject(PROJECT_B, ['purchase.quotations.manage']);
    const viewer = accessOnProject(PROJECT_A, ['purchase.quotations.view']);

    expect(quotationFlagsFor(access, { ...base, status: 'SUPERSEDED' }, false)).toEqual({
      canEdit: false,
      canRevise: false,
      canCancel: false,
    });
    expect(quotationFlagsFor(other, { ...base, status: 'DRAFT' }, false).canEdit).toBe(false);
    expect(quotationFlagsFor(viewer, { ...base, status: 'DRAFT' }, false).canEdit).toBe(false);
  });
});
