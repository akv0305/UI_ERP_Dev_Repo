'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findNavigationTrail } from '@/config/navigation';
import { terminology } from '@/config/terminology';

export function Breadcrumbs() {
  const pathname = usePathname();
  const trail = findNavigationTrail(pathname);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 text-sm">
        {trail.map((crumb, index) => (
          <li key={crumb.labelKey} className="flex min-w-0 items-center gap-2">
            {index > 0 ? (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {crumb.href !== undefined && index < trail.length - 1 ? (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground hover:text-foreground"
              >
                {terminology.nav[crumb.labelKey]}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground">
                {terminology.nav[crumb.labelKey]}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
