import { z } from 'zod';

/** Where a role assignment applies. Hierarchy: GLOBAL covers company covers project covers site covers store. */
export const ROLE_SCOPE_TYPES = ['GLOBAL', 'COMPANY', 'PROJECT', 'SITE'] as const;

export const RoleScopeType = z.enum(ROLE_SCOPE_TYPES);

export type RoleScopeType = z.infer<typeof RoleScopeType>;

/** Permissions with this prefix are only ever granted by GLOBAL assignments. */
export const ADMIN_PERMISSION_PREFIX = 'administration.';

export const ADMINISTRATOR_ROLE_CODE = 'ADMINISTRATOR';

export const ACCESS_ERROR_CODES = [
  'INVALID_SCOPE',
  'SCOPE_TARGET_INACTIVE',
  'ADMIN_ROLE_MUST_BE_GLOBAL',
  'ROLE_HAS_ADMIN_PERMISSIONS_MUST_BE_GLOBAL',
  'DUPLICATE_ASSIGNMENT',
  'CONTEXT_NOT_ALLOWED',
] as const;

export type AccessErrorCode = (typeof ACCESS_ERROR_CODES)[number];

// ---------- Assignments (user admin) ----------

const optionalUuid = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.uuid().nullable(),
);

/** One role grant as sent when a user is created or updated. Which target is required depends on scopeType. */
export const RoleAssignmentInput = z.object({
  roleId: z.uuid(),
  scopeType: RoleScopeType,
  companyId: optionalUuid,
  projectId: optionalUuid,
  siteId: optionalUuid,
});

export type RoleAssignmentInput = z.infer<typeof RoleAssignmentInput>;

/** True when exactly the target field matching scopeType is set (and the others are null). */
export function hasValidScopeShape(
  assignment: Pick<RoleAssignmentInput, 'scopeType' | 'companyId' | 'projectId' | 'siteId'>,
): boolean {
  const { scopeType, companyId, projectId, siteId } = assignment;

  switch (scopeType) {
    case 'GLOBAL':
      return companyId === null && projectId === null && siteId === null;
    case 'COMPANY':
      return companyId !== null && projectId === null && siteId === null;
    case 'PROJECT':
      return companyId === null && projectId !== null && siteId === null;
    case 'SITE':
      return companyId === null && projectId === null && siteId !== null;
  }
}

// ---------- Readable assignments (responses) ----------

export const ScopeTargetSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

export type ScopeTargetSummary = z.infer<typeof ScopeTargetSummary>;

export const RoleAssignmentResponse = z.object({
  id: z.uuid(),
  roleId: z.uuid(),
  roleCode: z.string(),
  roleName: z.string(),
  scopeType: RoleScopeType,
  /** The company, project or site the assignment applies to; null for GLOBAL. */
  target: ScopeTargetSummary.nullable(),
});

export type RoleAssignmentResponse = z.infer<typeof RoleAssignmentResponse>;

// ---------- Working context (current company / project of a session) ----------

export const SessionContext = z.object({
  companyId: z.uuid().nullable(),
  companyLabel: z.string().nullable(),
  projectId: z.uuid().nullable(),
  projectLabel: z.string().nullable(),
});

export type SessionContext = z.infer<typeof SessionContext>;

export const ContextCompanyOption = z.object({ id: z.uuid(), label: z.string() });

export type ContextCompanyOption = z.infer<typeof ContextCompanyOption>;

export const ContextProjectOption = z.object({
  id: z.uuid(),
  label: z.string(),
  companyId: z.uuid(),
});

export type ContextProjectOption = z.infer<typeof ContextProjectOption>;

export const ContextOptionsResponse = z.object({
  companies: z.array(ContextCompanyOption),
  projects: z.array(ContextProjectOption),
});

export type ContextOptionsResponse = z.infer<typeof ContextOptionsResponse>;

/** projectId omitted = keep the current project unless the company changes (then it is cleared). */
export const SetContextRequest = z.object({
  companyId: z.uuid().nullable(),
  projectId: z.uuid().nullable().optional(),
});

export type SetContextRequest = z.infer<typeof SetContextRequest>;
