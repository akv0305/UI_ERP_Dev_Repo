import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { StatusChip, type StatusKey } from '../status-chip';

export interface DetailTab {
  key: string;
  label: string;
  content: ReactNode;
}

export interface DetailLayoutProps {
  title: string;
  status?: StatusKey;
  actions?: ReactNode;
  tabs: DetailTab[];
  sidePanel?: ReactNode;
}

export function DetailLayout({ title, status, actions, tabs, sidePanel }: DetailLayoutProps) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {status ? <StatusChip status={status} /> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>

      <div className={cn('grid gap-4', sidePanel ? 'lg:grid-cols-3' : 'grid-cols-1')}>
        <div className={cn(sidePanel ? 'lg:col-span-2' : undefined)}>
          <Tabs defaultValue={tabs[0]?.key}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </div>
        {sidePanel ? <aside className="space-y-4">{sidePanel}</aside> : null}
      </div>
    </div>
  );
}
