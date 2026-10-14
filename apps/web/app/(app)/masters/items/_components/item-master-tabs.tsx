'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';

const ITEMS_HREF = '/masters/items';

const TABS = [
  { href: ITEMS_HREF, label: terminology.itemMaster.tabItems },
  { href: '/masters/items/categories', label: terminology.itemMaster.tabCategories },
  { href: '/masters/items/units', label: terminology.itemMaster.tabUnits },
];

/** Tabs of the item master. Each tab is its own page, so list filters stay in the URL. */
export function ItemMasterTabs() {
  const pathname = usePathname();
  // Categories and Units are matched first; everything else under /masters/items is the Items tab.
  const active =
    TABS.find((tab) => tab.href !== ITEMS_HREF && pathname.startsWith(tab.href))?.href ??
    ITEMS_HREF;

  return (
    <nav
      aria-label={terminology.itemMaster.tabsLabel}
      className="flex gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        const isActive = tab.href === active;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
