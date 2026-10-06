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

export const ALL_PERMISSIONS = [
  'purchase.indents.view',
  'purchase.enquiries.view',
  'purchase.quotations.view',
  'purchase.comparisons.view',
  'purchase.purchaseOrders.view',
  'stores.goodsReceipts.view',
  'stores.qualityCheck.view',
  'stores.stock.view',
  'stores.materialIssues.view',
  'stores.rejectedMaterialReturns.view',
  'planning.wbs.view',
  'masters.companies.view',
  'masters.projects.view',
  'masters.sitesAndStores.view',
  'masters.items.view',
  'masters.vendors.view',
  'administration.users.view',
  'administration.rolesAndPermissions.view',
  'administration.approvalMatrix.view',
  'administration.numberSeries.view',
  'administration.auditLog.view',
  'administration.systemHealth.view',
  'administration.componentGallery.view',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface NavigationItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavigationGroup {
  labelKey: string;
  items: NavigationItem[];
}

export interface Breadcrumb {
  labelKey: string;
  href?: string;
}

export const HOME_ITEM: NavigationItem = {
  labelKey: 'nav.home',
  href: '/home',
  icon: Home,
};

export const navigation: NavigationGroup[] = [
  {
    labelKey: 'nav.purchase',
    items: [
      {
        labelKey: 'nav.indents',
        href: '/purchase/indents',
        icon: ClipboardList,
        permission: 'purchase.indents.view',
      },
      {
        labelKey: 'nav.enquiries',
        href: '/purchase/enquiries',
        icon: FileSearch,
        permission: 'purchase.enquiries.view',
      },
      {
        labelKey: 'nav.quotations',
        href: '/purchase/quotations',
        icon: FileText,
        permission: 'purchase.quotations.view',
      },
      {
        labelKey: 'nav.comparisons',
        href: '/purchase/comparisons',
        icon: GitCompare,
        permission: 'purchase.comparisons.view',
      },
      {
        labelKey: 'nav.purchaseOrders',
        href: '/purchase/purchase-orders',
        icon: ShoppingCart,
        permission: 'purchase.purchaseOrders.view',
      },
    ],
  },
  {
    labelKey: 'nav.stores',
    items: [
      {
        labelKey: 'nav.goodsReceipts',
        href: '/stores/goods-receipts',
        icon: PackageCheck,
        permission: 'stores.goodsReceipts.view',
      },
      {
        labelKey: 'nav.qualityCheck',
        href: '/stores/quality-check',
        icon: ShieldCheck,
        permission: 'stores.qualityCheck.view',
      },
      {
        labelKey: 'nav.stock',
        href: '/stores/stock',
        icon: Boxes,
        permission: 'stores.stock.view',
      },
      {
        labelKey: 'nav.materialIssues',
        href: '/stores/material-issues',
        icon: PackageMinus,
        permission: 'stores.materialIssues.view',
      },
      {
        labelKey: 'nav.rejectedMaterialReturns',
        href: '/stores/rejected-material-returns',
        icon: Undo2,
        permission: 'stores.rejectedMaterialReturns.view',
      },
    ],
  },
  {
    labelKey: 'nav.planning',
    items: [
      {
        labelKey: 'nav.wbs',
        href: '/planning/wbs',
        icon: Network,
        permission: 'planning.wbs.view',
      },
    ],
  },
  {
    labelKey: 'nav.masters',
    items: [
      {
        labelKey: 'nav.companies',
        href: '/masters/companies',
        icon: Building2,
        permission: 'masters.companies.view',
      },
      {
        labelKey: 'nav.projects',
        href: '/masters/projects',
        icon: FolderKanban,
        permission: 'masters.projects.view',
      },
      {
        labelKey: 'nav.sitesAndStores',
        href: '/masters/sites-and-stores',
        icon: Warehouse,
        permission: 'masters.sitesAndStores.view',
      },
      {
        labelKey: 'nav.items',
        href: '/masters/items',
        icon: Package,
        permission: 'masters.items.view',
      },
      {
        labelKey: 'nav.vendors',
        href: '/masters/vendors',
        icon: Truck,
        permission: 'masters.vendors.view',
      },
    ],
  },
  {
    labelKey: 'nav.administration',
    items: [
      {
        labelKey: 'nav.users',
        href: '/administration/users',
        icon: Users,
        permission: 'administration.users.view',
      },
      {
        labelKey: 'nav.rolesAndPermissions',
        href: '/administration/roles-and-permissions',
        icon: Shield,
        permission: 'administration.rolesAndPermissions.view',
      },
      {
        labelKey: 'nav.approvalMatrix',
        href: '/administration/approval-matrix',
        icon: GitBranch,
        permission: 'administration.approvalMatrix.view',
      },
      {
        labelKey: 'nav.numberSeries',
        href: '/administration/number-series',
        icon: Hash,
        permission: 'administration.numberSeries.view',
      },
      {
        labelKey: 'nav.auditLog',
        href: '/administration/audit-log',
        icon: ScrollText,
        permission: 'administration.auditLog.view',
      },
      {
        labelKey: 'nav.systemHealth',
        href: '/administration/system-health',
        icon: Activity,
        permission: 'administration.systemHealth.view',
      },
      {
        labelKey: 'nav.componentGallery',
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
