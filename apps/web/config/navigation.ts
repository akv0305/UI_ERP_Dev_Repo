import {
  Activity,
  Boxes,
  Building2,
  ClipboardList,
  Component,
  FileSearch,
  FileText,
  FolderKanban,
  GitBranch,
  GitCompare,
  Hash,
  Home,
  Network,
  Package,
  PackageCheck,
  PackageMinus,
  ScrollText,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@uie/contracts';
import { terminology } from './terminology';

export type NavigationLabelKey = keyof typeof terminology.nav;

export interface NavigationItem {
  labelKey: NavigationLabelKey;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavigationGroup {
  labelKey: NavigationLabelKey;
  items: NavigationItem[];
}

export interface Breadcrumb {
  labelKey: NavigationLabelKey;
  href?: string;
}

export const HOME_ITEM: NavigationItem = {
  labelKey: 'home',
  href: '/home',
  icon: Home,
};

export const navigation: NavigationGroup[] = [
  {
    labelKey: 'purchase',
    items: [
      {
        labelKey: 'indents',
        href: '/purchase/indents',
        icon: ClipboardList,
        permission: 'purchase.indents.view',
      },
      {
        labelKey: 'enquiries',
        href: '/purchase/enquiries',
        icon: FileSearch,
        permission: 'purchase.enquiries.view',
      },
      {
        labelKey: 'quotations',
        href: '/purchase/quotations',
        icon: FileText,
        permission: 'purchase.quotations.view',
      },
      {
        labelKey: 'comparisons',
        href: '/purchase/comparisons',
        icon: GitCompare,
        permission: 'purchase.comparisons.view',
      },
      {
        labelKey: 'purchaseOrders',
        href: '/purchase/purchase-orders',
        icon: ShoppingCart,
        permission: 'purchase.purchaseOrders.view',
      },
    ],
  },
  {
    labelKey: 'stores',
    items: [
      {
        labelKey: 'goodsReceipts',
        href: '/stores/goods-receipts',
        icon: PackageCheck,
        permission: 'stores.goodsReceipts.view',
      },
      {
        labelKey: 'qualityCheck',
        href: '/stores/quality-check',
        icon: ShieldCheck,
        permission: 'stores.qualityCheck.view',
      },
      {
        labelKey: 'stock',
        href: '/stores/stock',
        icon: Boxes,
        permission: 'stores.stock.view',
      },
      {
        labelKey: 'materialIssues',
        href: '/stores/material-issues',
        icon: PackageMinus,
        permission: 'stores.materialIssues.view',
      },
      {
        labelKey: 'rejectedMaterialReturns',
        href: '/stores/rejected-material-returns',
        icon: Undo2,
        permission: 'stores.rejectedMaterialReturns.view',
      },
    ],
  },
  {
    labelKey: 'planning',
    items: [
      {
        labelKey: 'wbs',
        href: '/planning/wbs',
        icon: Network,
        permission: 'planning.wbs.view',
      },
    ],
  },
  {
    labelKey: 'masters',
    items: [
      {
        labelKey: 'companies',
        href: '/masters/companies',
        icon: Building2,
        permission: 'masters.companies.view',
      },
      {
        labelKey: 'projects',
        href: '/masters/projects',
        icon: FolderKanban,
        permission: 'masters.projects.view',
      },
      {
        labelKey: 'sitesAndStores',
        href: '/masters/sites-and-stores',
        icon: Warehouse,
        permission: 'masters.sitesAndStores.view',
      },
      {
        labelKey: 'items',
        href: '/masters/items',
        icon: Package,
        permission: 'masters.items.view',
      },
      {
        labelKey: 'vendors',
        href: '/masters/vendors',
        icon: Truck,
        permission: 'masters.vendors.view',
      },
    ],
  },
  {
    labelKey: 'administration',
    items: [
      {
        labelKey: 'users',
        href: '/administration/users',
        icon: Users,
        permission: 'administration.users.view',
      },
      {
        labelKey: 'rolesAndPermissions',
        href: '/administration/roles-and-permissions',
        icon: Shield,
        permission: 'administration.rolesAndPermissions.view',
      },
      {
        labelKey: 'approvalMatrix',
        href: '/administration/approval-matrix',
        icon: GitBranch,
        permission: 'administration.approvalMatrix.view',
      },
      {
        labelKey: 'numberSeries',
        href: '/administration/number-series',
        icon: Hash,
        permission: 'administration.numberSeries.view',
      },
      {
        labelKey: 'auditLog',
        href: '/administration/audit-log',
        icon: ScrollText,
        permission: 'administration.auditLog.view',
      },
      {
        labelKey: 'systemHealth',
        href: '/administration/system-health',
        icon: Activity,
        permission: 'administration.systemHealth.view',
      },
      {
        labelKey: 'componentGallery',
        href: '/administration/component-gallery',
        icon: Component,
        permission: 'administration.componentGallery.view',
      },
    ],
  },
];

export function isItemVisible(item: NavigationItem, permissions: readonly Permission[]): boolean {
  return item.permission === undefined || permissions.includes(item.permission);
}

export function getVisibleGroups(permissions: readonly Permission[]): NavigationGroup[] {
  return navigation
    .map((group) => ({
      labelKey: group.labelKey,
      items: group.items.filter((item) => isItemVisible(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

export function findNavigationTrail(pathname: string): Breadcrumb[] {
  if (pathname === HOME_ITEM.href) {
    return [{ labelKey: HOME_ITEM.labelKey, href: HOME_ITEM.href }];
  }

  for (const group of navigation) {
    for (const item of group.items) {
      if (pathname === item.href) {
        return [{ labelKey: group.labelKey }, { labelKey: item.labelKey, href: item.href }];
      }
    }
  }

  return [];
}
