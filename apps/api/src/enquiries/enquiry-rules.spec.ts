import { AccessContext, type AccessAssignment, type AccessLookup } from '../access/access-context';
import { enquiryFlagsFor, enquiryLineProblem, type IndentLineForEnquiry } from './enquiry-rules';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PROJECT_A = '22222222-2222-4222-8222-222222222222';
const PROJECT_B = '33333333-3333-4333-8333-333333333333';
const SITE = '44444444-4444-4444-8444-444444444444';
const OTHER_SITE = '77777777-7777-4777-8777-777777777777';

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

const enquiry = { companyId: COMPANY, projectId: PROJECT_A, siteId: SITE };

describe('enquiryFlagsFor', () => {
  const access = accessOnProject(PROJECT_A, ['purchase.enquiries.manage']);

  it('lets a manager edit and cancel a draft', () => {
    expect(enquiryFlagsFor(access, { ...enquiry, status: 'DRAFT' })).toEqual({
      canEdit: true,
      canClose: false,
      canCancel: true,
    });
  });

  it('lets a manager close or cancel a sent enquiry, not edit it', () => {
    expect(enquiryFlagsFor(access, { ...enquiry, status: 'SENT' })).toEqual({
      canEdit: false,
      canClose: true,
      canCancel: true,
    });
  });

  it('allows nothing on a closed enquiry', () => {
    expect(enquiryFlagsFor(access, { ...enquiry, status: 'CLOSED' })).toEqual({
      canEdit: false,
      canClose: false,
      canCancel: false,
    });
  });

  it('allows nothing on another project or with view only', () => {
    const other = accessOnProject(PROJECT_B, ['purchase.enquiries.manage']);
    const viewer = accessOnProject(PROJECT_A, ['purchase.enquiries.view']);

    expect(enquiryFlagsFor(other, { ...enquiry, status: 'DRAFT' }).canEdit).toBe(false);
    expect(enquiryFlagsFor(viewer, { ...enquiry, status: 'DRAFT' }).canEdit).toBe(false);
  });
});

describe('enquiryLineProblem', () => {
  const row: IndentLineForEnquiry = {
    siteId: SITE,
    indentApproved: true,
    approvedQty: '10.000',
    itemCode: 'ITM-000001',
    itemUsable: true,
    decimalPlaces: 1,
  };

  it('accepts the approved qty or less', () => {
    expect(enquiryLineProblem(1, '10', SITE, row)).toBeNull();
    expect(enquiryLineProblem(1, '2.5', SITE, row)).toBeNull();
  });

  it('refuses more than the approved qty and extra decimals', () => {
    expect(enquiryLineProblem(2, '10.5', SITE, row)).toEqual({
      code: 'INVALID_QUANTITY',
      message: 'Line 2: the quantity is more than the approved indent quantity.',
    });
    expect(enquiryLineProblem(1, '2.55', SITE, row)?.code).toBe('INVALID_QUANTITY');
  });

  it('refuses unknown lines, other sites, unapproved indents and refused lines', () => {
    expect(enquiryLineProblem(1, '1', SITE, undefined)?.code).toBe('INVALID_INDENT_LINE');
    expect(enquiryLineProblem(1, '1', OTHER_SITE, row)?.code).toBe('INVALID_INDENT_LINE');
    expect(enquiryLineProblem(1, '1', SITE, { ...row, indentApproved: false })?.code).toBe(
      'INVALID_INDENT_LINE',
    );
    expect(enquiryLineProblem(1, '1', SITE, { ...row, approvedQty: '0.000' })?.code).toBe(
      'INVALID_INDENT_LINE',
    );
  });

  it('names an item that is no longer usable (OQ-27)', () => {
    expect(enquiryLineProblem(3, '1', SITE, { ...row, itemUsable: false })?.message).toContain(
      'ITM-000001',
    );
  });
});
