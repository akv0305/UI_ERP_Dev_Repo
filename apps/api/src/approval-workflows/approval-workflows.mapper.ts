import type { ApprovalWorkflow } from '@prisma/client';
import type { ApprovalRoleSummary, ApprovalWorkflowResponse } from '@uie/contracts';

export interface LevelValues {
  levelNo: number;
  roleId: string;
  /** Always with 2 decimals ("200000.00"). */
  minAmount: string;
  makerCountsAsApproved: boolean;
}

export interface ScopeValues {
  id: string;
  code: string;
  name: string;
}

export interface ActorValues {
  id: string;
  displayName: string;
}

export interface WorkflowLookups {
  roles: ReadonlyMap<string, ApprovalRoleSummary>;
  companies: ReadonlyMap<string, ScopeValues>;
  users: ReadonlyMap<string, ActorValues>;
}

function required<T>(map: ReadonlyMap<string, T>, id: string, what: string): T {
  const value = map.get(id);

  if (value === undefined) {
    throw new Error(`${what} ${id} missing`);
  }

  return value;
}

export function toApprovalWorkflowResponse(
  workflow: ApprovalWorkflow,
  levels: readonly LevelValues[],
  lookups: WorkflowLookups,
): ApprovalWorkflowResponse {
  return {
    id: workflow.id,
    documentType: workflow.documentType,
    company:
      workflow.companyId === null
        ? null
        : required(lookups.companies, workflow.companyId, 'Company'),
    version: workflow.version,
    isCurrent: workflow.isCurrent,
    remarks: workflow.remarks,
    createdAt: workflow.createdAt.toISOString(),
    createdBy: required(lookups.users, workflow.createdById, 'User'),
    levels: [...levels]
      .sort((a, b) => a.levelNo - b.levelNo)
      .map((level) => ({
        levelNo: level.levelNo,
        role: required(lookups.roles, level.roleId, 'Role'),
        minAmount: level.minAmount,
        makerCountsAsApproved: level.makerCountsAsApproved,
      })),
  };
}

/** Readable values for the Audit Log: role and company codes instead of ids. */
export function toApprovalWorkflowAuditSnapshot(
  response: ApprovalWorkflowResponse,
): Record<string, unknown> {
  return {
    documentType: response.documentType,
    company: response.company?.code ?? null,
    version: response.version,
    isCurrent: response.isCurrent,
    remarks: response.remarks,
    levels: response.levels.map((level) => ({
      levelNo: level.levelNo,
      role: level.role.code,
      minAmount: level.minAmount,
      makerCountsAsApproved: level.makerCountsAsApproved,
    })),
  };
}
