'use client';

import { Menu } from 'lucide-react';
import { terminology } from '@/config/terminology';
import { Breadcrumbs } from './breadcrumbs';
import { NotificationBell } from './notification-bell';
import { Switcher, type SwitcherOption } from './switcher';
import { UserMenu } from './user-menu';

export interface TopBarProps {
  companies: SwitcherOption[];
  projects: SwitcherOption[];
  notificationCount: number;
  onOpenMenu: () => void;
}

export function TopBar({ companies, projects, notificationCount, onOpenMenu }: TopBarProps) {
  return (
    <header className="flex h-[var(--top-bar-height)] items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-4" aria-hidden />
      </button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 md:flex">
          <Switcher options={companies} placeholder={terminology.shell.selectCompany} />
          <Switcher options={projects} placeholder={terminology.shell.selectProject} />
        </div>
        <NotificationBell count={notificationCount} />
        <UserMenu />
      </div>
    </header>
  );
}
