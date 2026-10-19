import type { Prisma, State } from '@prisma/client';
import type {
  VendorBankAccountResponse,
  VendorContactResponse,
  VendorDetailResponse,
  VendorGstRegistrationResponse,
  VendorResponse,
} from '@uie/contracts';
import { fromDateOnly } from '../masters/master-helpers';
import { toStateResponse } from '../states/states.service';
import type { VendorFlags } from './vendor-access';

const actorSelect = { select: { id: true, displayName: true } } as const;

export const vendorInclude = {
  state: true,
  submittedBy: actorSelect,
  decidedBy: actorSelect,
} satisfies Prisma.VendorInclude;

export const vendorDetailInclude = {
  state: true,
  submittedBy: actorSelect,
  decidedBy: actorSelect,
  gstRegistrations: { include: { state: true }, orderBy: { createdAt: 'asc' } },
  bankAccounts: { orderBy: { createdAt: 'asc' } },
  contacts: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.VendorInclude;

export type VendorWithRelations = Prisma.VendorGetPayload<{ include: typeof vendorInclude }>;
export type VendorWithDetails = Prisma.VendorGetPayload<{ include: typeof vendorDetailInclude }>;

type VendorGstRow = VendorWithDetails['gstRegistrations'][number];
type VendorBankRow = VendorWithDetails['bankAccounts'][number];
type VendorContactRow = VendorWithDetails['contacts'][number];

/** Credit limit always as a 2-decimal string ("1200.00"); never passes through a float. */
export function amountText(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

/** "1200" / "01200.5" -> "1200.00" / "1200.50", to compare a request with the stored value. */
export function normalizeAmount(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const [whole = '0', fraction = ''] = value.split('.');

  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

const MASK = 'XXXXXX';

/** Bank account number for users without masters.vendors.manage (OQ-35 d). */
export function maskAccountNumber(value: string): string {
  return `${MASK}${value.slice(-4)}`;
}

export function toVendorResponse(vendor: VendorWithRelations, flags: VendorFlags): VendorResponse {
  return {
    id: vendor.id,
    code: vendor.code,
    legalName: vendor.legalName,
    tradeName: vendor.tradeName,
    vendorType: vendor.vendorType,
    pan: vendor.pan,
    udyamNumber: vendor.udyamNumber,
    msmeCategory: vendor.msmeCategory,
    addressLine1: vendor.addressLine1,
    addressLine2: vendor.addressLine2,
    city: vendor.city,
    state: vendor.state === null ? null : toStateResponse(vendor.state),
    pinCode: vendor.pinCode,
    paymentTermsDays: vendor.paymentTermsDays,
    creditLimit: amountText(vendor.creditLimit),
    remarks: vendor.remarks,
    status: vendor.status,
    submittedAt: vendor.submittedAt?.toISOString() ?? null,
    submittedBy: vendor.submittedBy,
    decidedAt: vendor.decidedAt?.toISOString() ?? null,
    decidedBy: vendor.decidedBy,
    decisionRemarks: vendor.decisionRemarks,
    isActive: vendor.isActive,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
    ...flags,
  };
}

export function toVendorGstResponse(row: VendorGstRow): VendorGstRegistrationResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    state: toStateResponse(row.state),
    gstin: row.gstin,
    registrationType: row.registrationType,
    effectiveFrom: fromDateOnly(row.effectiveFrom),
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    pinCode: row.pinCode,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVendorBankAccountResponse(
  row: VendorBankRow,
  showFullNumber: boolean,
): VendorBankAccountResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    accountName: row.accountName,
    accountNumber: showFullNumber ? row.accountNumber : maskAccountNumber(row.accountNumber),
    ifsc: row.ifsc,
    bankName: row.bankName,
    branchName: row.branchName,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVendorContactResponse(row: VendorContactRow): VendorContactResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    name: row.name,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVendorDetailResponse(
  vendor: VendorWithDetails,
  flags: VendorFlags,
): VendorDetailResponse {
  return {
    ...toVendorResponse(vendor, flags),
    gstRegistrations: vendor.gstRegistrations.map(toVendorGstResponse),
    bankAccounts: vendor.bankAccounts.map((row) =>
      toVendorBankAccountResponse(row, flags.canManage),
    ),
    contacts: vendor.contacts.map(toVendorContactResponse),
  };
}

function stateLabel(state: State | null): string | null {
  return state === null ? null : `${state.gstCode} ${state.name}`;
}

/** Readable values for the Audit Log (state as "36 Telangana"). */
export function toVendorAuditSnapshot(vendor: VendorWithRelations): Record<string, unknown> {
  return {
    code: vendor.code,
    legalName: vendor.legalName,
    tradeName: vendor.tradeName,
    vendorType: vendor.vendorType,
    pan: vendor.pan,
    udyamNumber: vendor.udyamNumber,
    msmeCategory: vendor.msmeCategory,
    addressLine1: vendor.addressLine1,
    addressLine2: vendor.addressLine2,
    city: vendor.city,
    state: stateLabel(vendor.state),
    pinCode: vendor.pinCode,
    paymentTermsDays: vendor.paymentTermsDays,
    creditLimit: amountText(vendor.creditLimit),
    remarks: vendor.remarks,
    status: vendor.status,
    decisionRemarks: vendor.decisionRemarks,
    isActive: vendor.isActive,
  };
}
