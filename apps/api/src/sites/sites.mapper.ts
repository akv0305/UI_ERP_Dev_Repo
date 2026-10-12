import type { Prisma, Store } from '@prisma/client';
import type { SiteResponse, StoreResponse } from '@uie/contracts';
import { stateLabel, toCompanySummary } from '../projects/projects.mapper';
import { toStateResponse } from '../states/states.service';

export const siteInclude = {
  state: true,
  project: { include: { company: true } },
} satisfies Prisma.SiteInclude;

export type SiteWithRelations = Prisma.SiteGetPayload<{ include: typeof siteInclude }>;

export const storeInclude = {
  site: { include: { project: { include: { company: true } } } },
} satisfies Prisma.StoreInclude;

export type StoreWithRelations = Prisma.StoreGetPayload<{ include: typeof storeInclude }>;

export function toSiteResponse(site: SiteWithRelations, canManage: boolean): SiteResponse {
  return {
    id: site.id,
    project: {
      id: site.project.id,
      code: site.project.code,
      name: site.project.name,
      isActive: site.project.isActive,
      company: toCompanySummary(site.project.company),
    },
    code: site.code,
    name: site.name,
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    state: site.state === null ? null : toStateResponse(site.state),
    pinCode: site.pinCode,
    contactPerson: site.contactPerson,
    contactPhone: site.contactPhone,
    isActive: site.isActive,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    canManage,
  };
}

export function toStoreResponse(store: Store, canManage: boolean): StoreResponse {
  return {
    id: store.id,
    siteId: store.siteId,
    code: store.code,
    name: store.name,
    isActive: store.isActive,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    canManage,
  };
}

export function toSiteAuditSnapshot(site: SiteWithRelations): Record<string, unknown> {
  return {
    code: site.code,
    name: site.name,
    project: site.project.code,
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    state: stateLabel(site.state),
    pinCode: site.pinCode,
    contactPerson: site.contactPerson,
    contactPhone: site.contactPhone,
    isActive: site.isActive,
  };
}

export function toStoreAuditSnapshot(store: StoreWithRelations): Record<string, unknown> {
  return {
    code: store.code,
    name: store.name,
    site: store.site.code,
    isActive: store.isActive,
  };
}
