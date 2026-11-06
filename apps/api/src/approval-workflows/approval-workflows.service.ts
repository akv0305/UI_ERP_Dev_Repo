import { Injectable } from '@nestjs/common';
import type { ApprovalWorkflow } from '@prisma/client';
import type {
  ApprovalRoleSummary,
  ApprovalWorkflowFormOptionsResponse,
  ApprovalWorkflowListResponse,
  ApprovalWorkflowResponse,
  SaveApprovalWorkflowRequest,
} from '@uie/contracts';
import { ADMINISTRATOR_ROLE_CODE } from '../auth/auth.mapper';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation, notFound } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  approvalWorkflowChanged,
  invalidApprovalCompany,
  invalidApprovalRole,
} from './approval-workflow-errors';
import {
  toApprovalWorkflowAuditSnapshot,
  toApprovalWorkflowResponse,
  type LevelValues,
  type ScopeValues,
} from './approval-workflows.mapper';

const ENTITY = 'Approval workflow';

/** "200000" -> "200000.00", "007.5" -> "7.50" (the contract allows up to 2 decimals). */
export function toMoney(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');

  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

@Injectable()
export class ApprovalWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Current version per document type: "all companies" first, then company overrides by code. */
  async listCurrent(): Promise<ApprovalWorkflowListResponse> {
    const workflows = await this.prisma.approvalWorkflow.findMany({ where: { isCurrent: true } });
    const items = await this.respondMany(workflows);

    items.sort(
      (a, b) =>
        a.documentType.localeCompare(b.documentType) ||
        (a.company?.code ?? '').localeCompare(b.company?.code ?? ''),
    );

    return { items };
  }

  /** Any version, current or old (POs keep the version they were submitted under, OQ-96). */
  async get(id: string): Promise<ApprovalWorkflowResponse> {
    const workflow = await this.prisma.approvalWorkflow.findUnique({ where: { id } });

    if (workflow === null) {
      throw notFound(ENTITY);
    }

    const [response] = await this.respondMany([workflow]);

    if (response === undefined) {
      throw notFound(ENTITY);
    }

    return response;
  }

  async formOptions(): Promise<ApprovalWorkflowFormOptionsResponse> {
    const [roles, companies] = await Promise.all([
      this.prisma.role.findMany({
        where: { isActive: true, code: { not: ADMINISTRATOR_ROLE_CODE } },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true, legalName: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    return {
      roles,
      companies: companies.map((company) => ({
        id: company.id,
        code: company.code,
        name: company.legalName,
      })),
    };
  }

  /**
   * Every save is a new version that applies at once (OQ-96, OQ-107 a): the current one is retired
   * and the new one becomes current, in one transaction. Level numbers follow the order sent.
   */
  async save(
    request: SaveApprovalWorkflowRequest,
    actorId: string,
  ): Promise<ApprovalWorkflowResponse> {
    const [company, roles, actor] = await Promise.all([
      this.checkCompany(request.companyId),
      this.checkRoles(request.levels.map((level) => level.roleId)),
      this.prisma.user.findUniqueOrThrow({
        where: { id: actorId },
        select: { id: true, displayName: true },
      }),
    ]);

    const levels: LevelValues[] = request.levels.map((level, index) => ({
      levelNo: index + 1,
      roleId: level.roleId,
      minAmount: toMoney(level.minAmount),
      makerCountsAsApproved: level.makerCountsAsApproved,
    }));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.approvalWorkflow.findFirst({
          where: { documentType: request.documentType, companyId: request.companyId },
          orderBy: { version: 'desc' },
        });
        const retiring = previous !== null && previous.isCurrent ? previous : null;

        if (retiring !== null) {
          await tx.approvalWorkflow.update({
            where: { id: retiring.id },
            data: { isCurrent: false },
          });
        }

        const workflow = await tx.approvalWorkflow.create({
          data: {
            documentType: request.documentType,
            companyId: request.companyId,
            version: (previous?.version ?? 0) + 1,
            isCurrent: true,
            remarks: request.remarks,
            createdById: actorId,
          },
        });

        await tx.approvalWorkflowLevel.createMany({
          data: levels.map((level) => ({ ...level, workflowId: workflow.id })),
        });

        const response = toApprovalWorkflowResponse(workflow, levels, {
          roles,
          companies: new Map(company === null ? [] : [[company.id, company] as const]),
          users: new Map([[actor.id, actor] as const]),
        });

        if (retiring !== null) {
          await this.audit.record(tx, {
            actorUserId: actorId,
            action: 'UPDATE',
            entityType: 'ApprovalWorkflow',
            entityId: retiring.id,
            companyId: retiring.companyId,
            before: { version: retiring.version, isCurrent: true },
            after: { version: retiring.version, isCurrent: false },
          });
        }

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'ApprovalWorkflow',
          entityId: workflow.id,
          companyId: workflow.companyId,
          before: null,
          after: toApprovalWorkflowAuditSnapshot(response),
        });

        return response;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw approvalWorkflowChanged();
      }

      throw error;
    }
  }

  private async checkCompany(companyId: string | null): Promise<ScopeValues | null> {
    if (companyId === null) {
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, code: true, legalName: true, isActive: true },
    });

    if (company === null) {
      throw invalidApprovalCompany('Company not found.');
    }

    if (!company.isActive) {
      throw invalidApprovalCompany(`Company ${company.code} is inactive.`);
    }

    return { id: company.id, code: company.code, name: company.legalName };
  }

  /** Active roles only; ADMINISTRATOR can never be a level (OQ-106). */
  private async checkRoles(roleIds: readonly string[]): Promise<Map<string, ApprovalRoleSummary>> {
    const rows = await this.prisma.role.findMany({
      where: { id: { in: [...new Set(roleIds)] } },
      select: { id: true, code: true, name: true, isActive: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row] as const));

    for (const [index, roleId] of roleIds.entries()) {
      const role = byId.get(roleId);
      const level = index + 1;

      if (role === undefined) {
        throw invalidApprovalRole(`Level ${level}: role not found.`);
      }

      if (!role.isActive) {
        throw invalidApprovalRole(`Level ${level}: role ${role.code} is inactive.`);
      }

      if (role.code === ADMINISTRATOR_ROLE_CODE) {
        throw invalidApprovalRole(`Level ${level}: the administrator role cannot be a level.`);
      }
    }

    return new Map(
      rows.map((row) => [row.id, { id: row.id, code: row.code, name: row.name }] as const),
    );
  }

  /** Loads levels, roles, companies and creators for the given versions in four queries. */
  private async respondMany(
    workflows: readonly ApprovalWorkflow[],
  ): Promise<ApprovalWorkflowResponse[]> {
    if (workflows.length === 0) {
      return [];
    }

    const levelRows = await this.prisma.approvalWorkflowLevel.findMany({
      where: { workflowId: { in: workflows.map((workflow) => workflow.id) } },
      orderBy: { levelNo: 'asc' },
    });
    const companyIds = workflows.flatMap((workflow) =>
      workflow.companyId === null ? [] : [workflow.companyId],
    );

    const [roles, companies, users] = await Promise.all([
      this.prisma.role.findMany({
        where: { id: { in: [...new Set(levelRows.map((row) => row.roleId))] } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.company.findMany({
        where: { id: { in: [...new Set(companyIds)] } },
        select: { id: true, code: true, legalName: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(workflows.map((workflow) => workflow.createdById))] } },
        select: { id: true, displayName: true },
      }),
    ]);

    const lookups = {
      roles: new Map(roles.map((role) => [role.id, role] as const)),
      companies: new Map(
        companies.map(
          (company) =>
            [company.id, { id: company.id, code: company.code, name: company.legalName }] as const,
        ),
      ),
      users: new Map(users.map((user) => [user.id, user] as const)),
    };

    return workflows.map((workflow) =>
      toApprovalWorkflowResponse(
        workflow,
        levelRows
          .filter((row) => row.workflowId === workflow.id)
          .map((row) => ({
            levelNo: row.levelNo,
            roleId: row.roleId,
            minAmount: row.minAmount.toFixed(2),
            makerCountsAsApproved: row.makerCountsAsApproved,
          })),
        lookups,
      ),
    );
  }
}
