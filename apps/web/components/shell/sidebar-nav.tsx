'use client';

import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  getVisibleGroups,
  HOME_ITEM,
  type NavigationItem,
  type Permission,
} from '@/config/navigation';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';

export interface SidebarNavProps {
  permissions: Permission[];
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}

interface NavLinkProps {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const Icon = item.icon;
  const label = terminology.nav[item.labelKey];

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={label}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground',
        active && 'bg-secondary text-secondary-foreground',
        collapsed && 'justify-center',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );
}

export function SidebarNav({
  permissions,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const groups = getVisibleGroups(permissions);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        {collapsed ? null : (
          <span className="truncate text-sm font-semibold text-foreground">
            {terminology.app.title}
          </span>
        )}
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'mx-auto' : 'ml-auto',
            )}
            aria-label="Toggle navigation"
          >
            {collapsed ? (
              <ChevronsRight className="size-4" aria-hidden />
            ) : (
              <ChevronsLeft className="size-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        <NavLink
          item={HOME_ITEM}
          active={pathname === HOME_ITEM.href}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        {groups.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            {collapsed ? null : (
              <p className="px-2 text-xs font-medium uppercase text-muted-foreground">
                {terminology.nav[group.labelKey]}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
