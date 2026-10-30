import { AccessContext, type AccessAssignment, type AccessLookup } from '../access/access-context';
import { comparisonFlagsFor } from './comparison-rules';

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

const base = {
  companyId: COMPANY,
  projectId: PROJECT_A,
  siteId: SITE,
  enquiry: { status: 'SENT' as const },
};

describe('comparisonFlagsFor', () => {
  const access = accessOnProject(PROJECT_A, ['purchase.comparisons.manage']);

  it('lets a manager edit, finalise and cancel a draft', () => {
    expect(comparisonFlagsFor(access, { ...base, status: 'DRAFT' })).toEqual({
      canEdit: true,
      canFinalise: true,
      canCancel: true,
    });
  });

  it('only cancel once the enquiry is no longer sent', () => {
    expect(
      comparisonFlagsFor(access, { ...base, status: 'DRAFT', enquiry: { status: 'CLOSED' } }),
    ).toEqual({ canEdit: false, canFinalise: false, canCancel: true });
  });

  it('allows nothing on finalised, on another project or with view only', () => {
    const other = accessOnProject(PROJECT_B, ['purchase.comparisons.manage']);
    const viewer = accessOnProject(PROJECT_A, ['purchase.comparisons.view']);

    expect(comparisonFlagsFor(access, { ...base, status: 'FINALISED' })).toEqual({
      canEdit: false,
      canFinalise: false,
      canCancel: false,
    });
    expect(comparisonFlagsFor(other, { ...base, status: 'DRAFT' }).canEdit).toBe(false);
    expect(comparisonFlagsFor(viewer, { ...base, status: 'DRAFT' }).canEdit).toBe(false);
  });
});
