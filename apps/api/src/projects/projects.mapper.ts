import type { Company, Prisma, State } from '@prisma/client';
import type { CompanySummary, ProjectResponse } from '@uie/contracts';
import { toStateResponse } from '../states/states.service';

export const projectInclude = {
  company: true,
  state: true,
  billingGst: true,
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export function toCompanySummary(company: Company): CompanySummary {
  return {
    id: company.id,
    code: company.code,
    legalName: company.legalName,
    isActive: company.isActive,
  };
}

export function toProjectResponse(
  project: ProjectWithRelations,
  canManage: boolean,
): ProjectResponse {
  return {
    id: project.id,
    company: toCompanySummary(project.company),
    code: project.code,
    name: project.name,
    state: project.state === null ? null : toStateResponse(project.state),
    billingGstRegistration:
      project.billingGst === null
        ? null
        : {
            id: project.billingGst.id,
            gstin: project.billingGst.gstin,
            isActive: project.billingGst.isActive,
          },
    isActive: project.isActive,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    canManage,
  };
}

export function stateLabel(state: State | null): string | null {
  return state === null ? null : `${state.gstCode} ${state.name}`;
}

/** Audit snapshot: readable values (company code, state label, billing GSTIN) instead of ids. */
export function toProjectAuditSnapshot(project: ProjectWithRelations): Record<string, unknown> {
  return {
    code: project.code,
    name: project.name,
    company: project.company.code,
    state: stateLabel(project.state),
    billingGstin: project.billingGst?.gstin ?? null,
    isActive: project.isActive,
  };
}
