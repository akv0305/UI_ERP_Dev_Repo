'use client';

import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { Permission } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';
import { TopBar } from './top-bar';
import type { SwitcherOption } from './switcher';

export interface AppShellProps {
  children: ReactNode;
  permissions: Permission[];
  companies: SwitcherOption[];
  projects: SwitcherOption[];
  notificationCount: number;
}

export function AppShell({
  children,
  permissions,
  companies,
  projects,
  notificationCount,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border bg-surface md:flex md:flex-col',
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
        )}
      >
        <SidebarNav
          permissions={permissions}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="w-[var(--mobile-sheet-width)]">
          <VisuallyHidden>
            <SheetTitle>{terminology.app.title}</SheetTitle>
          </VisuallyHidden>
          <SidebarNav
            permissions={permissions}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          companies={companies}
          projects={projects}
          notificationCount={notificationCount}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-[var(--page-padding-x)]">{children}</main>
      </div>
    </div>
  );
}
