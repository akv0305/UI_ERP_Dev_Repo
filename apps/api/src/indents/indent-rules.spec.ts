import { AccessContext, type AccessAssignment, type AccessLookup } from '../access/access-context';
import {
  checkApprovedQuantities,
  compareQuantity,
  fitsUnit,
  indentFlagsFor,
  todayInIst,
} from './indent-rules';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PROJECT_A = '22222222-2222-4222-8222-222222222222';
const PROJECT_B = '33333333-3333-4333-8333-333333333333';
const SITE = '44444444-4444-4444-8444-444444444444';
const MAKER = '55555555-5555-4555-8555-555555555555';
const CHECKER = '66666666-6666-4666-8666-666666666666';

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
    role: { code: 'PROJECT_MANAGER', isActive: true, permissions },
  };

  return new AccessContext([assignment], lookup);
}

const indent = {
  companyId: COMPANY,
  projectId: PROJECT_A,
  siteId: SITE,
  createdById: MAKER,
  submittedById: MAKER,
};

describe('quantities', () => {
  it('compares without floats', () => {
    expect(compareQuantity('10', '10.000')).toBe(0);
    expect(compareQuantity('2.5', '2.25')).toBe(1);
    expect(compareQuantity('9', '10')).toBe(-1);
    expect(compareQuantity('007.1', '7.100')).toBe(0);
  });

  it('checks decimals against the unit, ignoring trailing zeros', () => {
    expect(fitsUnit('2.50', 1)).toBe(true);
    expect(fitsUnit('2.55', 1)).toBe(false);
    expect(fitsUnit('3.000', 0)).toBe(true);
  });
});

describe('checkApprovedQuantities', () => {
  const lines = [
    { id: 'l1', lineNo: 1, requiredQty: '10.000', decimalPlaces: 0 },
    { id: 'l2', lineNo: 2, requiredQty: '2.500', decimalPlaces: 1 },
  ];

  it('accepts lowered quantities and a refused line', () => {
    expect(
      checkApprovedQuantities(lines, [
        { lineId: 'l1', approvedQty: '8' },
        { lineId: 'l2', approvedQty: '0' },
      ]),
    ).toBeNull();
  });

  it('refuses more than required', () => {
    expect(
      checkApprovedQuantities(lines, [
        { lineId: 'l1', approvedQty: '11' },
        { lineId: 'l2', approvedQty: '1' },
      ]),
    ).toContain('Line 1');
  });

  it('refuses a missing line, extra decimals and all zeros', () => {
    expect(checkApprovedQuantities(lines, [{ lineId: 'l1', approvedQty: '1' }])).not.toBeNull();
    expect(
      checkApprovedQuantities(lines, [
        { lineId: 'l1', approvedQty: '1.5' },
        { lineId: 'l2', approvedQty: '1' },
      ]),
    ).toContain('decimal');
    expect(
      checkApprovedQuantities(lines, [
        { lineId: 'l1', approvedQty: '0' },
        { lineId: 'l2', approvedQty: '0.0' },
      ]),
    ).toContain('Reject');
  });
});

describe('indentFlagsFor', () => {
  it('lets a project manager edit and cancel a draft', () => {
    const access = accessOnProject(PROJECT_A, ['purchase.indents.manage']);

    expect(
      indentFlagsFor(access, { ...indent, status: 'DRAFT', submittedById: null }, MAKER),
    ).toEqual({ canEdit: true, canApprove: false, canCancel: true });
  });

  it('never lets the creator or submitter approve', () => {
    const access = accessOnProject(PROJECT_A, ['purchase.indents.approve']);

    expect(
      indentFlagsFor(access, { ...indent, status: 'PENDING_APPROVAL' }, MAKER).canApprove,
    ).toBe(false);
    expect(
      indentFlagsFor(access, { ...indent, status: 'PENDING_APPROVAL' }, CHECKER).canApprove,
    ).toBe(true);
  });

  it('gives nothing on another project', () => {
    const access = accessOnProject(PROJECT_B, [
      'purchase.indents.manage',
      'purchase.indents.approve',
    ]);

    expect(indentFlagsFor(access, { ...indent, status: 'PENDING_APPROVAL' }, CHECKER)).toEqual({
      canEdit: false,
      canApprove: false,
      canCancel: false,
    });
  });
});

describe('todayInIst', () => {
  it('rolls over at midnight IST, not UTC', () => {
    expect(todayInIst(new Date('2026-10-22T18:29:00.000Z'))).toBe('2026-10-22');
    expect(todayInIst(new Date('2026-10-22T18:31:00.000Z'))).toBe('2026-10-23');
  });
});
