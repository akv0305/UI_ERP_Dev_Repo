import type { Prisma, State } from '@prisma/client';
import type {
  CompanyDetailResponse,
  CompanyResponse,
  GstRegistrationResponse,
} from '@uie/contracts';
import { fromDateOnly } from '../masters/master-helpers';
import { toStateResponse } from '../states/states.service';

export const companyInclude = { state: true } satisfies Prisma.CompanyInclude;

export const companyDetailInclude = {
  state: true,
  gstRegistrations: { include: { state: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CompanyInclude;

export type CompanyWithState = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;
export type CompanyWithRegistrations = Prisma.CompanyGetPayload<{
  include: typeof companyDetailInclude;
}>;

export const registrationInclude = { state: true } satisfies Prisma.CompanyGstRegistrationInclude;

export type RegistrationWithState = Prisma.CompanyGstRegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

export function toCompanyResponse(company: CompanyWithState, canManage: boolean): CompanyResponse {
  return {
    id: company.id,
    code: company.code,
    legalName: company.legalName,
    entityType: company.entityType,
    pan: company.pan,
    tan: company.tan,
    cin: company.cin,
    llpin: company.llpin,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    state: company.state === null ? null : toStateResponse(company.state),
    pinCode: company.pinCode,
    isActive: company.isActive,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    canManage,
  };
}

export function toRegistrationResponse(
  registration: RegistrationWithState,
): GstRegistrationResponse {
  return {
    id: registration.id,
    companyId: registration.companyId,
    state: toStateResponse(registration.state),
    gstin: registration.gstin,
    registrationType: registration.registrationType,
    effectiveFrom: fromDateOnly(registration.effectiveFrom),
    addressLine1: registration.addressLine1,
    addressLine2: registration.addressLine2,
    city: registration.city,
    pinCode: registration.pinCode,
    isActive: registration.isActive,
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  };
}

export function toCompanyDetailResponse(
  company: CompanyWithRegistrations,
  canManage: boolean,
): CompanyDetailResponse {
  return {
    ...toCompanyResponse(company, canManage),
    gstRegistrations: company.gstRegistrations.map(toRegistrationResponse),
  };
}

function stateLabel(state: State | null): string | null {
  return state === null ? null : `${state.gstCode} ${state.name}`;
}

/** Audit snapshot: the company's own fields (state shown as "code name"). */
export function toCompanyAuditSnapshot(company: CompanyWithState): Record<string, unknown> {
  return {
    code: company.code,
    legalName: company.legalName,
    entityType: company.entityType,
    pan: company.pan,
    tan: company.tan,
    cin: company.cin,
    llpin: company.llpin,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    state: stateLabel(company.state),
    pinCode: company.pinCode,
    isActive: company.isActive,
  };
}

export function toRegistrationAuditSnapshot(
  registration: RegistrationWithState,
): Record<string, unknown> {
  return {
    gstin: registration.gstin,
    state: stateLabel(registration.state),
    registrationType: registration.registrationType,
    effectiveFrom: fromDateOnly(registration.effectiveFrom),
    addressLine1: registration.addressLine1,
    addressLine2: registration.addressLine2,
    city: registration.city,
    pinCode: registration.pinCode,
    isActive: registration.isActive,
  };
}
