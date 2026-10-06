'use client';

import { KeyRound, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { terminology } from '@/config/terminology';

export interface UserMenuProps {
  displayName: string;
  onSignOut: () => void | Promise<void>;
}

export function UserMenu({ displayName, onSignOut }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={displayName}
        >
          <span className="hidden max-w-40 truncate text-sm text-foreground md:inline">
            {displayName}
          </span>
          <Avatar>
            <AvatarFallback>
              <User className="size-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/change-password">
            <KeyRound className="size-4" aria-hidden />
            {terminology.shell.changePassword}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOut className="size-4" aria-hidden />
          {terminology.shell.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
