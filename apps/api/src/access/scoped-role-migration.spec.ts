import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoleAssignmentInput, SetContextRequest, hasValidScopeShape } from '@uie/contracts';

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20261012120000_scoped_role_assignments',
    'migration.sql',
  ),
  'utf8',
);
const SCHEMA = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

/** SQL statements with comments removed, upper-cased, so keyword checks ignore wording and case. */
const STATEMENTS = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .toUpperCase();

describe('scoped role assignments migration is non-destructive', () => {
  it('drops no table and deletes no row', () => {
    expect(STATEMENTS).not.toMatch(/DROP\s+TABLE/);
    expect(STATEMENTS).not.toMatch(/\bTRUNCATE\b/);
    expect(STATEMENTS).not.toMatch(/\bDELETE\s+FROM\b/);
    expect(STATEMENTS).not.toMatch(/DROP\s+COLUMN/);
  });

  it('adds id as nullable, backfills it, then makes it the primary key', () => {
    const addId = STATEMENTS.indexOf('ADD COLUMN     "ID" UUID,');
    const backfill = STATEMENTS.indexOf('UPDATE "USER_ROLES" SET "ID" = GEN_RANDOM_UUID()');
    const notNull = STATEMENTS.indexOf('ALTER COLUMN "ID" SET NOT NULL');
    const dropPk = STATEMENTS.indexOf('DROP CONSTRAINT "USER_ROLES_PKEY"');
    const addPk = STATEMENTS.indexOf('ADD CONSTRAINT "USER_ROLES_PKEY" PRIMARY KEY ("ID")');

    expect(addId).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(addId);
    expect(notNull).toBeGreaterThan(backfill);
    expect(dropPk).toBeGreaterThan(notNull);
    expect(addPk).toBeGreaterThan(dropPk);
  });

  it('existing role links become GLOBAL: the scope column defaults to GLOBAL and no row is retargeted', () => {
    expect(STATEMENTS).toContain(`"SCOPETYPE" "ROLESCOPETYPE" NOT NULL DEFAULT 'GLOBAL'`);
    // The only UPDATE is the id backfill: no statement rewrites scope or targets of existing rows.
    const updates = STATEMENTS.match(/UPDATE\s+"[A-Z_]+"\s+SET\s+"[A-Z]+"/g) ?? [];

    expect(updates).toEqual(['UPDATE "USER_ROLES" SET "ID"']);
  });

  it('adds the scope CHECK for all four scope types', () => {
    expect(STATEMENTS).toContain('CONSTRAINT "USER_ROLES_SCOPE_TARGET_CHECK" CHECK');
    for (const scope of ['GLOBAL', 'COMPANY', 'PROJECT', 'SITE']) {
      expect(STATEMENTS).toContain(`"SCOPETYPE" = '${scope}'`);
    }
  });

  it('adds UNIQUE NULLS NOT DISTINCT over user, role, scope and the three targets', () => {
    expect(STATEMENTS).toContain(
      'UNIQUE NULLS NOT DISTINCT ("USERID", "ROLEID", "SCOPETYPE", "COMPANYID", "PROJECTID", "SITEID")',
    );
  });

  it('foreign keys to companies, projects and sites restrict deletes; session context is set null', () => {
    for (const table of ['companies', 'projects', 'sites']) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `user_roles_\\w+_fkey" FOREIGN KEY \\("\\w+"\\) REFERENCES "${table}"\\("id"\\) ON DELETE RESTRICT`,
        ),
      );
    }
    expect(MIGRATION).toMatch(/sessions_currentCompanyId_fkey[^;]*ON DELETE SET NULL/);
    expect(MIGRATION).toMatch(/sessions_currentProjectId_fkey[^;]*ON DELETE SET NULL/);
  });

  it('indexes userId, companyId, projectId and siteId', () => {
    for (const column of ['userId', 'companyId', 'projectId', 'siteId']) {
      expect(MIGRATION).toContain(
        `CREATE INDEX "user_roles_${column}_idx" ON "user_roles"("${column}")`,
      );
    }
  });

  it('keeps the schema in step with the migration', () => {
    expect(SCHEMA).toMatch(/enum RoleScopeType \{\s*GLOBAL\s*COMPANY\s*PROJECT\s*SITE\s*\}/);
    expect(SCHEMA).toMatch(/currentCompanyId\s+String\?\s+@db\.Uuid/);
    expect(SCHEMA).toMatch(/currentProjectId\s+String\?\s+@db\.Uuid/);
    expect(SCHEMA).toContain('@@map("user_roles")');
  });
});

describe('assignment contracts', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('parses empty-string targets as null (form posts)', () => {
    const parsed = RoleAssignmentInput.parse({
      roleId: id,
      scopeType: 'GLOBAL',
      companyId: '',
      projectId: undefined,
      siteId: null,
    });

    expect(parsed).toEqual({
      roleId: id,
      scopeType: 'GLOBAL',
      companyId: null,
      projectId: null,
      siteId: null,
    });
  });

  it.each([
    ['GLOBAL', {}, true],
    ['GLOBAL', { companyId: id }, false],
    ['COMPANY', { companyId: id }, true],
    ['COMPANY', {}, false],
    ['COMPANY', { companyId: id, siteId: id }, false],
    ['PROJECT', { projectId: id }, true],
    ['PROJECT', { companyId: id }, false],
    ['SITE', { siteId: id }, true],
    ['SITE', { siteId: id, projectId: id }, false],
  ] as const)('scope shape %s %j is valid: %s', (scopeType, target, valid) => {
    const base = { companyId: null, projectId: null, siteId: null };

    expect(hasValidScopeShape({ scopeType, ...base, ...target })).toBe(valid);
  });

  it('SetContextRequest accepts company-only, both, and null', () => {
    expect(SetContextRequest.safeParse({ companyId: id }).success).toBe(true);
    expect(SetContextRequest.safeParse({ companyId: id, projectId: id }).success).toBe(true);
    expect(SetContextRequest.safeParse({ companyId: null, projectId: null }).success).toBe(true);
    expect(SetContextRequest.safeParse({ projectId: id }).success).toBe(false);
    expect(SetContextRequest.safeParse({ companyId: 'nope' }).success).toBe(false);
  });
});
