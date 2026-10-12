'use client';

import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ContextOptionsResponse, Permission, SessionContext } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import type { ContextChange } from '@/lib/context';
import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';
import { TopBar } from './top-bar';

export interface AppShellProps {
  children: ReactNode;
  permissions: Permission[];
  displayName: string;
  onSignOut: () => void | Promise<void>;
  contextOptions: ContextOptionsResponse;
  context: SessionContext;
  onChangeContext: (change: ContextChange) => Promise<boolean>;
  notificationCount: number;
}

export function AppShell({
  children,
  permissions,
  displayName,
  onSignOut,
  contextOptions,
  context,
  onChangeContext,
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
          contextOptions={contextOptions}
          context={context}
          onChangeContext={onChangeContext}
          displayName={displayName}
          onSignOut={onSignOut}
          notificationCount={notificationCount}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-[var(--page-padding-x)]">{children}</main>
      </div>
    </div>
  );
}
