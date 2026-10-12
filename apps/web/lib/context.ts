import type { ContextOptionsResponse, SessionContext } from '@uie/contracts';
import type { SwitcherOption } from '@/components/shell/switcher';

export const EMPTY_CONTEXT_OPTIONS: ContextOptionsResponse = { companies: [], projects: [] };

export const NO_CONTEXT: SessionContext = {
  companyId: null,
  companyLabel: null,
  projectId: null,
  projectLabel: null,
};

export function companyOptions(options: ContextOptionsResponse): SwitcherOption[] {
  return options.companies.map((company) => ({ value: company.id, label: company.label }));
}

/** Only the projects of the selected company; with no company selected there is nothing to choose. */
export function projectOptionsFor(
  options: ContextOptionsResponse,
  companyId: string | null,
): SwitcherOption[] {
  if (companyId === null) {
    return [];
  }

  return options.projects
    .filter((project) => project.companyId === companyId)
    .map((project) => ({ value: project.id, label: project.label }));
}

export interface ContextChange {
  companyId: string | null;
  /** Left out when only the company changed: the API then clears the project. */
  projectId?: string | null;
}

/** The request for choosing a company (clears the project) . */
export function changeCompany(companyId: string | null): ContextChange {
  return { companyId };
}

/** The request for choosing a project of the current company (null = all projects). */
export function changeProject(companyId: string | null, projectId: string | null): ContextChange {
  return { companyId, projectId };
}

/** The context as it will be once `change` is applied; used to update the shell at once. */
export function applyChange(
  current: SessionContext,
  options: ContextOptionsResponse,
  change: ContextChange,
): SessionContext {
  const company =
    change.companyId === null
      ? null
      : (options.companies.find((item) => item.id === change.companyId) ?? null);
  const keepProject = change.projectId === undefined && change.companyId === current.companyId;
  const projectId =
    company === null ? null : keepProject ? current.projectId : (change.projectId ?? null);
  const project =
    projectId === null ? null : (options.projects.find((item) => item.id === projectId) ?? null);

  return {
    companyId: company?.id ?? null,
    companyLabel: company?.label ?? null,
    projectId: project?.id ?? null,
    projectLabel: project?.label ?? null,
  };
}
